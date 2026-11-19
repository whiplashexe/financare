import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { users } from "../../db/schema/users.js";
import OneTimeService from "../../services/onetime/index.js";
import {
  createUser,
  dayInJakarta,
  deleteUsers,
  insertOneTimePlan,
  oneTimeRow,
  startServer,
} from "../helpers.js";

const server = startServer();
const emails: string[] = [];
const SECRET = "test-cron-secret-0123456789";

const newUser = async () => {
  const user = await createUser(server);
  emails.push(user.email);
  return user;
};

type User = Awaited<ReturnType<typeof newUser>>;

const call = (method: string, path: string, user: User, body?: unknown) =>
  server.request({
    method,
    path,
    body,
    headers: { authorization: `Bearer ${user.accessToken}` },
  });

const previousSecret = process.env.CRON_SECRET;

beforeAll(() => {
  process.env.CRON_SECRET = SECRET;
});

afterAll(async () => {
  if (previousSecret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = previousSecret;
  try {
    await deleteUsers(emails);
  } finally {
    server.close();
  }
});

describe("marking missed one-time plans", () => {
  it("marks a planned plan whose date has passed, and nothing else", async () => {
    const user = await newUser();
    const past = await insertOneTimePlan({ userId: user.userId, date: dayInJakarta(-1) });
    const today = await insertOneTimePlan({ userId: user.userId, date: dayInJakarta(0) });
    const future = await insertOneTimePlan({ userId: user.userId, date: dayInJakarta(3) });
    const done = await insertOneTimePlan({ userId: user.userId, date: dayInJakarta(-5), status: "DONE" });
    const cancelled = await insertOneTimePlan({ userId: user.userId, date: dayInJakarta(-5), status: "CANCELLED" });
    const missed = await insertOneTimePlan({ userId: user.userId, date: dayInJakarta(-5), status: "MISSED" });

    const result = await OneTimeService.markMissed();

    expect(result.planIds).toContain(past);
    for (const id of [today, future, done, cancelled, missed]) {
      expect(result.planIds).not.toContain(id);
    }
    expect((await oneTimeRow(past)).status).toBe("MISSED");
    expect((await oneTimeRow(today)).status).toBe("PLANNED");
    expect((await oneTimeRow(future)).status).toBe("PLANNED");
    expect((await oneTimeRow(done)).status).toBe("DONE");
    expect((await oneTimeRow(cancelled)).status).toBe("CANCELLED");
    expect((await oneTimeRow(missed)).status).toBe("MISSED");
  });

  it("running it again changes nothing", async () => {
    const user = await newUser();
    const past = await insertOneTimePlan({ userId: user.userId, date: dayInJakarta(-2) });

    const first = await OneTimeService.markMissed();
    const second = await OneTimeService.markMissed();

    expect(first.planIds).toContain(past);
    expect(second.planIds).not.toContain(past);
    expect((await oneTimeRow(past)).status).toBe("MISSED");
  });

  it("a plan marked missed can be rescheduled back to planned", async () => {
    const user = await newUser();
    const past = await insertOneTimePlan({ userId: user.userId, date: dayInJakarta(-2) });
    await OneTimeService.markMissed();

    const res = await call("PATCH", `/one-time-plans/${past}`, user, { date: dayInJakarta(7) });

    expect(res.status).toBe(200);
    expect((await res.json()).data.status).toBe("PLANNED");
  });

  it("ignores the plans of a deleted user", async () => {
    const user = await newUser();
    const past = await insertOneTimePlan({ userId: user.userId, date: dayInJakarta(-2) });
    await db.update(users).set({ deletedAt: new Date() }).where(eq(users.id, user.userId));

    const result = await OneTimeService.markMissed();

    expect(result.planIds).not.toContain(past);
    expect((await oneTimeRow(past)).status).toBe("PLANNED");
  });

  it("decides 'past' in the owner's timezone", async () => {
    const ahead = await newUser();
    await call("PATCH", "/me", ahead, { timezone: "Pacific/Kiritimati" });
    const behind = await newUser();
    await call("PATCH", "/me", behind, { timezone: "Pacific/Pago_Pago" });

    const aheadYesterday = new Date(Date.now() + 14 * 60 * 60 * 1000 - 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const behindToday = new Date(Date.now() - 11 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const missed = await insertOneTimePlan({ userId: ahead.userId, date: aheadYesterday });
    const stillPlanned = await insertOneTimePlan({ userId: behind.userId, date: behindToday });

    await OneTimeService.markMissed();

    expect((await oneTimeRow(missed)).status).toBe("MISSED");
    expect((await oneTimeRow(stillPlanned)).status).toBe("PLANNED");
  });
});

describe("GET /internal/cron/one-time-plans-missed", () => {
  const trigger = (headers: Record<string, string> = {}) =>
    server.request({ method: "GET", path: "/internal/cron/one-time-plans-missed", headers });

  it("401 without the secret or with a wrong one", async () => {
    expect((await trigger()).status).toBe(401);
    expect((await trigger({ authorization: "Bearer wrong-secret-wrong-secret" })).status).toBe(401);
    expect((await trigger({ authorization: `Bearer ${SECRET}x` })).status).toBe(401);
  });

  it("401 when no usable secret is configured", async () => {
    delete process.env.CRON_SECRET;
    try {
      expect((await trigger({ authorization: `Bearer ${SECRET}` })).status).toBe(401);
    } finally {
      process.env.CRON_SECRET = SECRET;
    }
  });

  it("200 with the secret: runs the job and reports the plans it marked", async () => {
    const user = await newUser();
    const past = await insertOneTimePlan({ userId: user.userId, date: dayInJakarta(-3) });

    const res = await trigger({ authorization: `Bearer ${SECRET}` });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.missed).toBeGreaterThanOrEqual(1);
    expect(json.data.planIds).toContain(past);
    expect((await oneTimeRow(past)).status).toBe("MISSED");
  });
});
