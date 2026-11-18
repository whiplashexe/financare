import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { users } from "../../db/schema/users.js";
import { hashToken } from "../../utils/token.util.js";
import {
  createUser,
  deleteRateLimit,
  deleteUser,
  insertResetToken,
  refreshRows,
  resetRows,
  startServer,
  uniqueEmail,
} from "../helpers.js";

const sentEmails: { to: string; token: string }[] = [];

mock.module("../../lib/mailer.js", () => ({
  sendPasswordResetEmail: async (mail: { to: string; token: string }) => {
    sentEmails.push(mail);
  },
}));

const server = startServer();
const emails: string[] = [];

beforeEach(() => {
  sentEmails.length = 0;
});

const newUser = async () => {
  const user = await createUser(server);
  emails.push(user.email);
  return user;
};

const forgot = (email: unknown) =>
  server.post({ path: "/auth/forgot-password", body: { email } });
const reset = (token: unknown, newPassword: unknown) =>
  server.post({
    path: "/auth/reset-password",
    body: { token, new_password: newPassword },
  });
const login = (email: string, password: string) =>
  server.post({ path: "/auth/login", body: { email, password } });
const refresh = (token: string) =>
  server.post({ path: "/auth/refresh", body: { refresh_token: token } });

afterAll(async () => {
  try {
    for (const email of emails) {
      await deleteUser(email);
      await deleteRateLimit(`forgot:${email}`);
    }
  } finally {
    server.close();
  }
});

describe("POST /auth/forgot-password", () => {
  it("202 for a registered email, and creates a single-use token valid for 30 minutes", async () => {
    const user = await newUser();

    const res = await forgot(user.email);
    const json = await res.json();

    expect(res.status).toBe(202);
    expect(json.success).toBe(true);
    expect(json.message).toBe(
      "If the email is registered, a password reset link has been sent",
    );

    const rows = await resetRows(user.userId);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.usedAt).toBeNull();

    expect(sentEmails).toHaveLength(1);
    expect(sentEmails[0]!.to).toBe(user.email);
    expect(hashToken(sentEmails[0]!.token)).toBe(rows[0]!.tokenHash);

    const minutesLeft = (rows[0]!.expiresAt.getTime() - Date.now()) / 60_000;
    expect(minutesLeft).toBeGreaterThan(28);
    expect(minutesLeft).toBeLessThanOrEqual(31);
  });

  it("202 with an identical body for an unregistered email", async () => {
    const user = await newUser();
    const stranger = uniqueEmail();
    emails.push(stranger);

    const known = await forgot(user.email);
    const unknown = await forgot(stranger);

    expect(unknown.status).toBe(202);
    expect(sentEmails.map((m) => m.to)).toEqual([user.email]);

    const a = await known.json();
    const b = await unknown.json();
    expect(b).toEqual(a);
  });

  it("matches the email case-insensitively", async () => {
    const user = await newUser();

    const res = await forgot(user.email.toUpperCase());

    expect(res.status).toBe(202);
    expect(await resetRows(user.userId)).toHaveLength(1);
  });

  it("202 but no token for a soft-deleted account", async () => {
    const user = await newUser();
    await db
      .update(users)
      .set({ deletedAt: new Date() })
      .where(eq(users.id, user.userId));

    const res = await forgot(user.email);

    expect(res.status).toBe(202);
    expect(await resetRows(user.userId)).toHaveLength(0);
    expect(sentEmails).toHaveLength(0);
  });

  it("a new request replaces the previous unused token", async () => {
    const user = await newUser();

    await forgot(user.email);
    const first = (await resetRows(user.userId))[0]!;
    await forgot(user.email);
    const rows = await resetRows(user.userId);

    expect(rows).toHaveLength(1);
    expect(rows[0]!.tokenHash).not.toBe(first.tokenHash);
  });

  it("stops creating tokens after 3 requests per email, still answering 202", async () => {
    const user = await newUser();

    for (let i = 0; i < 3; i++) await forgot(user.email);
    const third = (await resetRows(user.userId))[0]!;

    const fourth = await forgot(user.email);

    expect(fourth.status).toBe(202);
    const rows = await resetRows(user.userId);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.tokenHash).toBe(third.tokenHash);
    expect(sentEmails).toHaveLength(3);
  });

  it("400: invalid email, missing email, unknown field", async () => {
    expect((await forgot("not-an-email")).status).toBe(400);
    expect(
      (await server.post({ path: "/auth/forgot-password", body: {} })).status,
    ).toBe(400);
    expect(
      (
        await server.post({
          path: "/auth/forgot-password",
          body: { email: uniqueEmail(), admin: true },
        })
      ).status,
    ).toBe(400);
  });
});

describe("POST /auth/reset-password", () => {
  it("204: changes the password; the old one stops working", async () => {
    const user = await newUser();
    const token = await insertResetToken(user.userId);

    const res = await reset(token, "brand-new-pass");

    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");
    expect((await login(user.email, "brand-new-pass")).status).toBe(200);
    expect((await login(user.email, user.password)).status).toBe(401);
  });

  it("marks the token as used, so it cannot be used twice", async () => {
    const user = await newUser();
    const token = await insertResetToken(user.userId);

    await reset(token, "brand-new-pass");

    const rows = await resetRows(user.userId);
    expect(rows[0]!.usedAt).not.toBeNull();

    const again = await reset(token, "another-new-pass");
    const json = await again.json();
    expect(again.status).toBe(400);
    expect(json.code).toBe("VALIDATION_ERROR");
    expect(Object.keys(json.errors)).toContain("token");
    expect((await login(user.email, "another-new-pass")).status).toBe(401);
  });

  it("revokes every refresh token of the user", async () => {
    const user = await newUser();
    const token = await insertResetToken(user.userId);

    await reset(token, "brand-new-pass");

    const rows = await refreshRows(user.userId);
    expect(rows.every((r) => r.revokedAt !== null)).toBe(true);
    expect((await refresh(user.refreshToken)).status).toBe(401);
  });

  it("invalidates the other unused reset tokens of the user", async () => {
    const user = await newUser();
    const first = await insertResetToken(user.userId);
    const second = await insertResetToken(user.userId);

    expect((await reset(first, "brand-new-pass")).status).toBe(204);
    expect((await reset(second, "other-new-pass")).status).toBe(400);
  });

  it("400 for an expired token, with the same body as an unknown token", async () => {
    const user = await newUser();
    const expired = await insertResetToken(user.userId, { expired: true });

    const a = await reset(expired, "brand-new-pass");
    const b = await reset("not-a-real-token", "brand-new-pass");

    expect(a.status).toBe(400);
    expect(b.status).toBe(400);
    expect(await a.json()).toEqual(await b.json());
    expect((await login(user.email, user.password)).status).toBe(200);
  });

  it("400 for a token that was already used", async () => {
    const user = await newUser();
    const used = await insertResetToken(user.userId, { used: true });

    expect((await reset(used, "brand-new-pass")).status).toBe(400);
  });

  it("400 for a weak password, and the token stays usable", async () => {
    const user = await newUser();
    const token = await insertResetToken(user.userId);

    const weak = await reset(token, "short");
    const json = await weak.json();

    expect(weak.status).toBe(400);
    expect(Object.keys(json.errors)).toContain("new_password");
    expect((await reset(token, "brand-new-pass")).status).toBe(204);
  });

  it("400 for a soft-deleted account, and the password is unchanged", async () => {
    const user = await newUser();
    const token = await insertResetToken(user.userId);
    await db
      .update(users)
      .set({ deletedAt: new Date() })
      .where(eq(users.id, user.userId));
    const [before] = await db.select().from(users).where(eq(users.id, user.userId));

    const res = await reset(token, "brand-new-pass");

    expect(res.status).toBe(400);
    const [after] = await db.select().from(users).where(eq(users.id, user.userId));
    expect(after!.passwordHash).toBe(before!.passwordHash);
  });

  it("two simultaneous resets with the same token: only one succeeds", async () => {
    const user = await newUser();
    const token = await insertResetToken(user.userId);

    const [a, b] = await Promise.all([
      reset(token, "first-new-pass"),
      reset(token, "second-new-pass"),
    ]);

    expect([a.status, b.status].sort()).toEqual([204, 400]);
  });

  it("400: missing fields, unknown field, no body", async () => {
    expect((await server.post({ path: "/auth/reset-password", body: {} })).status).toBe(400);
    expect(
      (
        await server.post({
          path: "/auth/reset-password",
          body: { token: "x", new_password: "long-enough-pass", user_id: "USR001" },
        })
      ).status,
    ).toBe(400);
    expect((await server.post({ path: "/auth/reset-password" })).status).toBe(400);
  });

  it("works end to end with the token that forgot-password emailed", async () => {
    const user = await newUser();

    await forgot(user.email);
    expect(sentEmails).toHaveLength(1);
    const { token } = sentEmails[0]!;

    expect((await reset(token, "end-to-end-pass")).status).toBe(204);
    expect((await login(user.email, "end-to-end-pass")).status).toBe(200);
  });
});
