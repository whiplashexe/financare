import { afterAll, afterEach, beforeAll, describe, expect, it } from "bun:test";
import { eq, inArray } from "drizzle-orm";
import { db } from "../../db/index.js";
import { idempotencyKeys } from "../../db/schema/idempotency.keys.js";
import { rateLimits } from "../../db/schema/rate.limits.js";
import { refreshTokens } from "../../db/schema/refresh.tokens.js";
import { transactions } from "../../db/schema/transactions.js";
import { users } from "../../db/schema/users.js";
import { accounts } from "../../db/schema/accounts.js";
import { purgeDeletedAccounts } from "../../services/maintenance/account.purge.service.js";
import { cleanupExpired } from "../../services/maintenance/expired.cleanup.service.js";
import { purgeTrash } from "../../services/maintenance/trash.purge.service.js";
import { fakeCloudinary } from "../cloudinary.fake.js";
import { fakeDelivery } from "../delivery.fake.js";
import { createUser, deleteUsers, startServer } from "../helpers.js";

const server = startServer();
const emails: string[] = [];
const SECRET = "test-cron-secret-0123456789";
const previousSecret = process.env.CRON_SECRET;

const newUser = async () => {
  const user = await createUser(server);
  emails.push(user.email);
  return user;
};

beforeAll(() => {
  process.env.CRON_SECRET = SECRET;
  fakeCloudinary.install();
  fakeDelivery.install();
});
afterEach(() => fakeCloudinary.reset());
afterAll(async () => {
  process.env.CRON_SECRET = previousSecret;
  fakeCloudinary.restore();
  fakeDelivery.restore();
  await deleteUsers(emails);
});

describe("cleanupExpired", () => {
  it("removes expired refresh tokens and keeps valid ones", async () => {
    const user = await newUser();
    const before = await db.select().from(refreshTokens).where(eq(refreshTokens.userId, user.userId));
    expect(before.length).toBeGreaterThan(0);
    await db
      .update(refreshTokens)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(refreshTokens.userId, user.userId));
    const fresh = await newUser();

    const result = await cleanupExpired();
    expect(result.refreshTokens).toBeGreaterThanOrEqual(before.length);
    expect(await db.select().from(refreshTokens).where(eq(refreshTokens.userId, user.userId))).toHaveLength(0);
    expect((await db.select().from(refreshTokens).where(eq(refreshTokens.userId, fresh.userId))).length).toBeGreaterThan(0);
  });

  it("removes expired rate limit rows", async () => {
    const key = `test:expired:${crypto.randomUUID()}`;
    await db.insert(rateLimits).values({ key, count: 1, resetAt: new Date(Date.now() - 1000) });
    const live = `test:live:${crypto.randomUUID()}`;
    await db.insert(rateLimits).values({ key: live, count: 1, resetAt: new Date(Date.now() + 60_000) });
    await cleanupExpired();
    expect(await db.select().from(rateLimits).where(eq(rateLimits.key, key))).toHaveLength(0);
    expect(await db.select().from(rateLimits).where(eq(rateLimits.key, live))).toHaveLength(1);
    await db.delete(rateLimits).where(eq(rateLimits.key, live));
  });
});

describe("purgeTrash", () => {
  it("permanently deletes transactions trashed more than 30 days ago", async () => {
    const user = await newUser();
    const account = (await (await server.request({
      method: "POST",
      path: "/accounts",
      body: { name: "Main", type: "BANK", initial_balance: 1000 },
      headers: { authorization: `Bearer ${user.accessToken}` },
    })).json()).data.id as string;

    const add = async (deletedAt: Date | null) => {
      const [row] = await db
        .insert(transactions)
        .values({
          userId: user.userId,
          accountId: account,
          type: "OUTCOME",
          name: "Trash test",
          amount: 100,
          deletedAt,
        })
        .returning({ id: transactions.id });
      return row!.id;
    };
    const old = await add(new Date(Date.now() - 31 * 86_400_000));
    const recent = await add(new Date(Date.now() - 5 * 86_400_000));
    const live = await add(null);

    const result = await purgeTrash();
    expect(result.purged).toBeGreaterThanOrEqual(1);
    const remaining = (await db.select({ id: transactions.id }).from(transactions).where(inArray(transactions.id, [old, recent, live]))).map((row) => row.id);
    expect(remaining).not.toContain(old);
    expect(remaining).toContain(recent);
    expect(remaining).toContain(live);
  });
});

describe("purgeDeletedAccounts", () => {
  it("removes the user data and the Cloudinary folder", async () => {
    const user = await newUser();
    await server.request({
      method: "POST",
      path: "/accounts",
      body: { name: "Main", type: "BANK", initial_balance: 1000 },
      headers: { authorization: `Bearer ${user.accessToken}` },
    });
    await db.update(users).set({ deletedAt: new Date() }).where(eq(users.id, user.userId));
    const keeper = await newUser();

    const result = await purgeDeletedAccounts();
    expect(result.userIds).toContain(user.userId);
    expect(result.userIds).not.toContain(keeper.userId);
    expect(await db.select().from(users).where(eq(users.id, user.userId))).toHaveLength(0);
    expect(await db.select().from(accounts).where(eq(accounts.userId, user.userId))).toHaveLength(0);
    expect(fakeCloudinary.removedPrefixes).toContain(`financare/${user.userId}/`);
    expect(await db.select().from(users).where(eq(users.id, keeper.userId))).toHaveLength(1);
  });
});

describe("internal cron endpoints", () => {
  const call = (path: string, token?: string) =>
    server.request({
      method: "GET",
      path: `/internal/cron/${path}`,
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });

  for (const path of ["trash-purge", "expired-cleanup", "account-purge", "reminders", "daily", "tick"]) {
    it(`rejects ${path} without the secret`, async () => {
      expect((await call(path)).status).toBe(401);
      expect((await call(path, "wrong-secret-0123456789")).status).toBe(401);
    });

    it(`runs ${path} with the secret`, async () => {
      const res = await call(path, SECRET);
      expect(res.status).toBe(200);
      expect((await res.json()).success).toBe(true);
    });
  }

  it("daily reports each step", async () => {
    const data = (await (await call("daily", SECRET)).json()).data;
    expect(Object.keys(data).sort()).toEqual(
      ["accountPurge", "expiredCleanup", "imageCleanup", "oneTimePlansMissed", "trashPurge"].sort(),
    );
  });

  it("tick reports each step", async () => {
    const data = (await (await call("tick", SECRET)).json()).data;
    expect(Object.keys(data).sort()).toEqual(["recurringAutoRecord", "reminders"]);
  });
});
