import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { rateLimits } from "../../db/schema/rate.limits.js";
import {
  deleteRateLimit,
  deleteRateLimitsLike,
  deleteUser,
  randomIp,
  startServer,
  uniqueEmail,
} from "../helpers.js";

const server = startServer();
const email = uniqueEmail();
const password = "secret123";
const ips: string[] = [];
const emails: string[] = [email];

const newIp = () => {
  const ip = randomIp();
  ips.push(ip);
  return ip;
};

const login = (body: unknown, ip: string) =>
  server.post({ path: "/auth/login", body, ip });

const resetIpWindow = (ip: string) => deleteRateLimit(`auth:ip:${ip}`);

const failedLogin = async (target: string, ip: string) => {
  await resetIpWindow(ip);
  return login({ email: target, password: "wrong-password" }, ip);
};

beforeAll(async () => {
  await server.post({
    path: "/auth/register",
    body: { name: "Test", email, password },
  });
});

afterAll(async () => {
  try {
    for (const e of emails) {
      await deleteUser(e);
      await deleteRateLimitsLike(`login:fail:${e}:%`);
    }
    for (const ip of ips) await deleteRateLimit(`auth:ip:${ip}`);
  } finally {
    server.close();
  }
});

describe("per-IP limit on auth endpoints (5 per minute)", () => {
  it("429 on the 6th request from the same IP, with Retry-After", async () => {
    const ip = newIp();
    const statuses: number[] = [];
    for (let i = 0; i < 5; i++) {
      const target = uniqueEmail();
      emails.push(target);
      statuses.push((await login({ email: target, password }, ip)).status);
    }
    expect(statuses).toEqual([401, 401, 401, 401, 401]);

    const blocked = await login({ email: uniqueEmail(), password }, ip);
    const json = await blocked.json();

    expect(blocked.status).toBe(429);
    expect(json.success).toBe(false);
    expect(json.code).toBe("RATE_LIMITED");
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThanOrEqual(1);
  });

  it("is shared between login and register for the same IP", async () => {
    const ip = newIp();
    for (let i = 0; i < 5; i++) {
      await login({ email: uniqueEmail(), password }, ip);
    }

    const res = await server.post({
      path: "/auth/register",
      body: { name: "Test", email: uniqueEmail(), password },
      ip,
    });
    expect(res.status).toBe(429);
  });

  it("does not affect other IPs", async () => {
    const busy = newIp();
    for (let i = 0; i < 6; i++) {
      await login({ email: uniqueEmail(), password }, busy);
    }

    const res = await login({ email, password }, newIp());
    expect(res.status).toBe(200);
  });

  it("counts invalid requests too (limiter runs before validation)", async () => {
    const ip = newIp();
    for (let i = 0; i < 5; i++) await login({}, ip);

    const res = await login({ email, password }, ip);
    expect(res.status).toBe(429);
  });
});

describe("failed-login lockout (5 failures per email and IP)", () => {
  it("locks the 6th attempt, even with the correct password", async () => {
    const ip = newIp();

    for (let i = 0; i < 5; i++) {
      expect((await failedLogin(email, ip)).status).toBe(401);
    }

    await resetIpWindow(ip);
    const locked = await login({ email, password }, ip);
    const json = await locked.json();

    expect(locked.status).toBe(429);
    expect(json.code).toBe("RATE_LIMITED");
    expect(json.data).toBeUndefined();
    expect(Number(locked.headers.get("retry-after"))).toBeGreaterThanOrEqual(1);
  });

  it("does not lock the same email from another IP", async () => {
    const attacker = newIp();
    for (let i = 0; i < 5; i++) await failedLogin(email, attacker);

    const res = await login({ email, password }, newIp());
    expect(res.status).toBe(200);
  });

  it("does not lock other emails from the same IP", async () => {
    const ip = newIp();
    for (let i = 0; i < 5; i++) await failedLogin(email, ip);

    await resetIpWindow(ip);
    const other = uniqueEmail();
    emails.push(other);
    const res = await login({ email: other, password }, ip);
    expect(res.status).toBe(401);
  });

  it("a successful login resets the failure counter", async () => {
    const ip = newIp();
    for (let i = 0; i < 4; i++) await failedLogin(email, ip);

    await resetIpWindow(ip);
    expect((await login({ email, password }, ip)).status).toBe(200);

    for (let i = 0; i < 4; i++) {
      expect((await failedLogin(email, ip)).status).toBe(401);
    }
  });

  it("locks an unregistered email exactly like a registered one", async () => {
    const ghost = uniqueEmail();
    emails.push(ghost);
    const ipA = newIp();
    const ipB = newIp();

    for (let i = 0; i < 5; i++) {
      await failedLogin(ghost, ipA);
      await failedLogin(email, ipB);
    }

    await resetIpWindow(ipA);
    await resetIpWindow(ipB);
    const forGhost = await login({ email: ghost, password }, ipA);
    const forUser = await login({ email, password: "wrong-password" }, ipB);

    expect(forGhost.status).toBe(429);
    expect(forUser.status).toBe(429);

    const a = await forGhost.json();
    const b = await forUser.json();
    expect(a.message).toBe(b.message);
    expect(a.code).toBe(b.code);
  });

  it("allows login again once the window has ended", async () => {
    const ip = newIp();
    for (let i = 0; i < 5; i++) await failedLogin(email, ip);

    await db
      .update(rateLimits)
      .set({ resetAt: new Date(Date.now() - 1000) })
      .where(eq(rateLimits.key, `login:fail:${email}:${ip}`));

    await resetIpWindow(ip);
    const res = await login({ email, password }, ip);
    expect(res.status).toBe(200);
  });
});
