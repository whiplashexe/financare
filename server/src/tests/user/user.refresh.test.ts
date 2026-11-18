import { afterAll, describe, expect, it } from "bun:test";
import { eq } from "drizzle-orm";
import { jwtVerify } from "jose";
import { db } from "../../db/index.js";
import { refreshTokens } from "../../db/schema/refresh.tokens.js";
import { users } from "../../db/schema/users.js";
import { hashToken } from "../../utils/token.util.js";
import {
  createUser,
  deleteRateLimit,
  deleteUser,
  randomIp,
  refreshRows,
  startServer,
} from "../helpers.js";

const server = startServer();
const emails: string[] = [];
const ips: string[] = [];

const newUser = async () => {
  const user = await createUser(server);
  emails.push(user.email);
  return user;
};

const refresh = (token: unknown, ip?: string) =>
  server.post({ path: "/auth/refresh", body: { refresh_token: token }, ip });

afterAll(async () => {
  try {
    for (const email of emails) await deleteUser(email);
    for (const ip of ips) await deleteRateLimit(`refresh:ip:${ip}`);
  } finally {
    server.close();
  }
});

describe("POST /auth/refresh: rotation", () => {
  it("200: returns new tokens per PRD, without a user object", async () => {
    const user = await newUser();

    const res = await refresh(user.refreshToken);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.user).toBeUndefined();
    expect(json.data.access_token).toBeString();
    expect(json.data.access_expires_in).toBe(900);
    expect(json.data.refresh_token).toBeString();
    expect(json.data.refresh_token).not.toBe(user.refreshToken);
  });

  it("returns a valid access token for the same user", async () => {
    const user = await newUser();

    const json = await (await refresh(user.refreshToken)).json();

    const secret = new TextEncoder().encode(process.env.JWT_ACCESS_SECRET);
    const { payload } = await jwtVerify(json.data.access_token, secret);
    expect(payload.sub).toBe(user.userId);
  });

  it("revokes the old token and links it to the new one in the same family", async () => {
    const user = await newUser();

    const json = await (await refresh(user.refreshToken)).json();

    const rows = await refreshRows(user.userId);
    const oldRow = rows.find((r) => r.tokenHash === hashToken(user.refreshToken))!;
    const newRow = rows.find(
      (r) => r.tokenHash === hashToken(json.data.refresh_token),
    )!;

    expect(rows).toHaveLength(2);
    expect(oldRow.revokedAt).not.toBeNull();
    expect(oldRow.replacedBy).toBe(newRow.id);
    expect(newRow.familyId).toBe(oldRow.familyId);
    expect(newRow.revokedAt).toBeNull();
    expect(newRow.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("carries the device info over to the new token", async () => {
    const user = await newUser();
    const before = (await refreshRows(user.userId))[0]!;

    await refresh(user.refreshToken);

    const rows = await refreshRows(user.userId);
    expect(rows.every((r) => r.deviceInfo === before.deviceInfo)).toBe(true);
  });

  it("allows a chain of rotations", async () => {
    const user = await newUser();

    const first = await (await refresh(user.refreshToken)).json();
    const second = await refresh(first.data.refresh_token);
    const secondJson = await second.json();
    const third = await refresh(secondJson.data.refresh_token);

    expect(second.status).toBe(200);
    expect(third.status).toBe(200);
    expect(await refreshRows(user.userId)).toHaveLength(4);
  });
});

describe("POST /auth/refresh: rejected (401)", () => {
  it("reuse of a rotated token revokes the whole family", async () => {
    const user = await newUser();
    const rotated = await (await refresh(user.refreshToken)).json();

    const reuse = await refresh(user.refreshToken);
    expect(reuse.status).toBe(401);

    const rows = await refreshRows(user.userId);
    expect(rows.every((r) => r.revokedAt !== null)).toBe(true);

    const legit = await refresh(rotated.data.refresh_token);
    expect(legit.status).toBe(401);
  });

  it("reuse detection does not affect another session of the same user", async () => {
    const user = await newUser();
    const otherLogin = await (
      await server.post({
        path: "/auth/login",
        body: { email: user.email, password: user.password },
      })
    ).json();

    await refresh(user.refreshToken);
    await refresh(user.refreshToken);

    const res = await refresh(otherLogin.data.refresh_token);
    expect(res.status).toBe(200);
  });

  it("unknown token returns the same body as a reused token", async () => {
    const user = await newUser();
    await refresh(user.refreshToken);

    const reused = await refresh(user.refreshToken);
    const unknown = await refresh("not-a-real-token");

    expect(reused.status).toBe(401);
    expect(unknown.status).toBe(401);

    const a = await reused.json();
    const b = await unknown.json();
    expect(b.message).toBe(a.message);
    expect(b.code).toBe(a.code);
    expect(b.data).toBeUndefined();
  });

  it("expired token returns TOKEN_EXPIRED and is not rotated", async () => {
    const user = await newUser();
    await db
      .update(refreshTokens)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(refreshTokens.tokenHash, hashToken(user.refreshToken)));

    const res = await refresh(user.refreshToken);
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.code).toBe("TOKEN_EXPIRED");

    const rows = await refreshRows(user.userId);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.revokedAt).toBeNull();
  });

  it("soft-deleted user is rejected and the family is revoked", async () => {
    const user = await newUser();
    await db
      .update(users)
      .set({ deletedAt: new Date() })
      .where(eq(users.id, user.userId));

    const res = await refresh(user.refreshToken);

    expect(res.status).toBe(401);
    const rows = await refreshRows(user.userId);
    expect(rows.every((r) => r.revokedAt !== null)).toBe(true);
  });

  it("two simultaneous refreshes with the same token: one wins, the family is revoked", async () => {
    const user = await newUser();

    const [a, b] = await Promise.all([
      refresh(user.refreshToken),
      refresh(user.refreshToken),
    ]);

    expect([a.status, b.status].sort()).toEqual([200, 401]);

    const rows = await refreshRows(user.userId);
    expect(rows.every((r) => r.revokedAt !== null)).toBe(true);
  });
});

describe("POST /auth/refresh: validation (400)", () => {
  it("400: missing refresh_token", async () => {
    const res = await server.post({ path: "/auth/refresh", body: {} });
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.code).toBe("VALIDATION_ERROR");
    expect(Object.keys(json.errors)).toContain("refresh_token");
  });

  it("400: empty or non-string refresh_token", async () => {
    expect((await refresh("")).status).toBe(400);
    expect((await refresh(12345)).status).toBe(400);
  });

  it("400: unknown field is rejected", async () => {
    const res = await server.post({
      path: "/auth/refresh",
      body: { refresh_token: "x", user_id: "USR001" },
    });
    expect(res.status).toBe(400);
  });

  it("400: no body", async () => {
    const res = await server.post({ path: "/auth/refresh" });
    expect(res.status).toBe(400);
  });
});

describe("POST /auth/refresh: per-IP limit (30 per minute)", () => {
  it("429 on the 31st request from the same IP, with Retry-After", async () => {
    const ip = randomIp();
    ips.push(ip);

    for (let i = 0; i < 30; i++) {
      expect((await refresh("not-a-real-token", ip)).status).toBe(401);
    }

    const blocked = await refresh("not-a-real-token", ip);
    const json = await blocked.json();

    expect(blocked.status).toBe(429);
    expect(json.code).toBe("RATE_LIMITED");
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThanOrEqual(1);
  }, 60_000);
});
