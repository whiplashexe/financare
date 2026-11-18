import { afterAll, describe, expect, it } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { rateLimits } from "../../db/schema/rate.limits.js";
import {
  clearRateLimit,
  consumeRateLimit,
  peekRateLimit,
  purgeExpiredRateLimits,
} from "../../utils/rate.limit.util.js";
import { deleteRateLimit } from "../helpers.js";

const used: string[] = [];
const newKey = () => {
  const key = `test:${crypto.randomUUID()}`;
  used.push(key);
  return key;
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

afterAll(async () => {
  for (const key of used) await deleteRateLimit(key);
});

describe("consumeRateLimit", () => {
  it("counts hits and becomes limited only above the limit", async () => {
    const key = newKey();
    const args = { key, limit: 3, windowMs: 60_000 };

    const states = [];
    for (let i = 0; i < 4; i++) states.push(await consumeRateLimit(args));

    expect(states.map((s) => s.count)).toEqual([1, 2, 3, 4]);
    expect(states.map((s) => s.limited)).toEqual([false, false, false, true]);
  });

  it("reports a retry time within the window while limited", async () => {
    const key = newKey();
    const args = { key, limit: 1, windowMs: 60_000 };

    await consumeRateLimit(args);
    const state = await consumeRateLimit(args);

    expect(state.limited).toBe(true);
    expect(state.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    expect(state.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it("starts a new window after the previous one ends", async () => {
    const key = newKey();
    const args = { key, limit: 1, windowMs: 300 };

    await consumeRateLimit(args);
    expect((await consumeRateLimit(args)).limited).toBe(true);

    await sleep(450);

    const state = await consumeRateLimit(args);
    expect(state.count).toBe(1);
    expect(state.limited).toBe(false);
  });

  it("keeps separate counters per key", async () => {
    const a = newKey();
    const b = newKey();
    await consumeRateLimit({ key: a, limit: 1, windowMs: 60_000 });
    await consumeRateLimit({ key: a, limit: 1, windowMs: 60_000 });

    const state = await consumeRateLimit({ key: b, limit: 1, windowMs: 60_000 });
    expect(state.count).toBe(1);
  });

  it("counts every hit under concurrent requests (atomic)", async () => {
    const key = newKey();
    const args = { key, limit: 100, windowMs: 60_000 };

    await Promise.all(Array.from({ length: 10 }, () => consumeRateLimit(args)));

    const [row] = await db.select().from(rateLimits).where(eq(rateLimits.key, key));
    expect(row!.count).toBe(10);
  });
});

describe("peekRateLimit", () => {
  it("is not limited for an unknown key and does not create a row", async () => {
    const key = newKey();
    const state = await peekRateLimit({ key, limit: 3 });

    expect(state).toEqual({ count: 0, limited: false, retryAfterSeconds: 0 });
    const rows = await db.select().from(rateLimits).where(eq(rateLimits.key, key));
    expect(rows).toHaveLength(0);
  });

  it("is limited once `limit` hits are recorded, without changing the count", async () => {
    const key = newKey();
    const args = { key, limit: 2, windowMs: 60_000 };

    await consumeRateLimit(args);
    expect((await peekRateLimit({ key, limit: 2 })).limited).toBe(false);

    await consumeRateLimit(args);
    expect((await peekRateLimit({ key, limit: 2 })).limited).toBe(true);
    expect((await peekRateLimit({ key, limit: 2 })).count).toBe(2);
  });

  it("ignores a window that has ended", async () => {
    const key = newKey();
    await consumeRateLimit({ key, limit: 1, windowMs: 200 });
    await sleep(350);

    expect((await peekRateLimit({ key, limit: 1 })).limited).toBe(false);
  });
});

describe("clearRateLimit and purgeExpiredRateLimits", () => {
  it("clearRateLimit removes the counter", async () => {
    const key = newKey();
    await consumeRateLimit({ key, limit: 1, windowMs: 60_000 });
    await clearRateLimit(key);

    expect((await peekRateLimit({ key, limit: 1 })).count).toBe(0);
  });

  it("purgeExpiredRateLimits removes only expired rows", async () => {
    const expired = newKey();
    const active = newKey();
    await consumeRateLimit({ key: expired, limit: 1, windowMs: 100 });
    await consumeRateLimit({ key: active, limit: 1, windowMs: 60_000 });
    await sleep(250);

    await purgeExpiredRateLimits();

    const rows = await db.select().from(rateLimits);
    const keys = rows.map((r) => r.key);
    expect(keys).not.toContain(expired);
    expect(keys).toContain(active);
  });
});
