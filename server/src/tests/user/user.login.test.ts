import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { eq } from "drizzle-orm";
import { jwtVerify } from "jose";
import { db } from "../../db/index.js";
import { refreshTokens } from "../../db/schema/refresh.tokens.js";
import { users } from "../../db/schema/users.js";
import { hashToken } from "../../utils/token.util.js";
import { deleteUser, startServer, uniqueEmail } from "../helpers.js";

const server = startServer();
const email = uniqueEmail();
const deletedEmail = uniqueEmail();
const password = "secret123";

const login = (body?: unknown) => server.post({ path: "/auth/login", body });
const register = (body?: unknown) =>
  server.post({ path: "/auth/register", body });

const sessionsOf = (userId: string) =>
  db.select().from(refreshTokens).where(eq(refreshTokens.userId, userId));

beforeAll(async () => {
  await register({ name: "Test", email, password });
  await register({ name: "Deleted User", email: deletedEmail, password });
  await db
    .update(users)
    .set({ deletedAt: new Date() })
    .where(eq(users.email, deletedEmail));
});

afterAll(async () => {
  try {
    await deleteUser(email);
    await deleteUser(deletedEmail);
  } finally {
    server.close();
  }
});

describe("POST /auth/login: success", () => {
  it("200: returns user and tokens per PRD, without passwordHash", async () => {
    const res = await login({ email, password });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.user).toEqual({
      id: expect.stringMatching(/^USR\d{3,}$/),
      name: "Test",
      email,
      timezone: "Asia/Jakarta",
    });
    expect(json.data.access_token).toBeString();
    expect(json.data.access_expires_in).toBe(900);
    expect(json.data.refresh_token).toBeString();
    expect(JSON.stringify(json)).not.toContain("passwordHash");
    expect(JSON.stringify(json)).not.toContain("password_hash");
  });

  it("200: access token is a valid JWT whose subject is the user id", async () => {
    const res = await login({ email, password });
    const json = await res.json();

    const secret = new TextEncoder().encode(process.env.JWT_ACCESS_SECRET);
    const { payload } = await jwtVerify(json.data.access_token, secret);

    expect(payload.sub).toBe(json.data.user.id);
    expect(payload.exp).toBeGreaterThan(Date.now() / 1000);
  });

  it("200: email is matched case-insensitively", async () => {
    const res = await login({ email: email.toUpperCase(), password });
    expect(res.status).toBe(200);
  });

  it("200: accepts device info and stores it on the session", async () => {
    const res = await login({
      email,
      password,
      device: { platform: "ANDROID", name: "Pixel 8" },
    });
    const json = await res.json();
    expect(res.status).toBe(200);

    const rows = await sessionsOf(json.data.user.id);
    expect(rows.some((r) => r.deviceInfo === "ANDROID Pixel 8")).toBe(true);
  });

  it("stores only the hash of the refresh token", async () => {
    const res = await login({ email, password });
    const json = await res.json();
    const raw: string = json.data.refresh_token;

    const rows = await sessionsOf(json.data.user.id);
    const hashes = rows.map((r) => r.tokenHash);

    expect(hashes).toContain(hashToken(raw));
    expect(hashes).not.toContain(raw);
  });

  it("each login creates its own session family", async () => {
    const first = await (await login({ email, password })).json();
    const second = await (await login({ email, password })).json();

    expect(first.data.refresh_token).not.toBe(second.data.refresh_token);

    const rows = await sessionsOf(first.data.user.id);
    const byHash = new Map(rows.map((r) => [r.tokenHash, r]));
    const a = byHash.get(hashToken(first.data.refresh_token))!;
    const b = byHash.get(hashToken(second.data.refresh_token))!;

    expect(a.familyId).not.toBe(b.familyId);
    expect(a.revokedAt).toBeNull();
    expect(b.revokedAt).toBeNull();
  });
});

describe("POST /auth/login: rejected (401, generic)", () => {
  it("401: wrong password", async () => {
    const res = await login({ email, password: "wrong-password" });
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.success).toBe(false);
    expect(json.data).toBeUndefined();
  });

  it("401: unknown email returns the exact same body as a wrong password", async () => {
    const wrongPassword = await login({ email, password: "wrong-password" });
    const unknownEmail = await login({
      email: uniqueEmail(),
      password: "wrong-password",
    });

    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.status).toBe(401);

    const a = await wrongPassword.json();
    const b = await unknownEmail.json();
    expect(b.message).toBe(a.message);
    expect(b.code).toBe(a.code);
    expect(b.statusCode).toBe(a.statusCode);
  });

  it("401: soft-deleted account cannot log in, same body as a wrong password", async () => {
    const wrongPassword = await login({ email, password: "wrong-password" });
    const deleted = await login({ email: deletedEmail, password });

    expect(deleted.status).toBe(401);

    const a = await wrongPassword.json();
    const b = await deleted.json();
    expect(b.message).toBe(a.message);
    expect(b.code).toBe(a.code);
  });

  it("does not create a session when login fails", async () => {
    const before = (
      await sessionsOf(
        (await (await login({ email, password })).json()).data.user.id,
      )
    ).length;

    await login({ email, password: "wrong-password" });

    const [row] = await db.select().from(users).where(eq(users.email, email));
    const after = (await sessionsOf(row!.id)).length;

    expect(after).toBe(before);
  });
});

describe("POST /auth/login: validation (400)", () => {
  it("400: invalid email format and missing password, errors per field", async () => {
    const res = await login({ email: "not-an-email" });
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.code).toBe("VALIDATION_ERROR");
    expect(Object.keys(json.errors)).toEqual(
      expect.arrayContaining(["email", "password"]),
    );
  });

  it("400: empty password", async () => {
    const res = await login({ email, password: "" });
    expect(res.status).toBe(400);
  });

  it("400: invalid device platform", async () => {
    const res = await login({
      email,
      password,
      device: { platform: "WINDOWS" },
    });
    expect(res.status).toBe(400);
  });

  it("400: unknown field is rejected", async () => {
    const res = await login({ email, password, role: "admin" });
    expect(res.status).toBe(400);
  });

  it("400: no body", async () => {
    const res = await login();
    expect(res.status).toBe(400);
  });
});
