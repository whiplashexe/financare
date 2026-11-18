import { and, eq, gt, lt, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { rateLimits } from "../db/schema/rate.limits.js";

export type RateLimitState = {
  count: number;
  limited: boolean;
  retryAfterSeconds: number;
};

const SECONDS_LEFT = sql`GREATEST(1, CEIL(EXTRACT(EPOCH FROM (reset_at - now()))))::int`;

export const consumeRateLimit = async ({
  key,
  limit,
  windowMs,
}: {
  key: string;
  limit: number;
  windowMs: number;
}): Promise<RateLimitState> => {
  const result = await db.execute<{ count: number; retry_after: number }>(sql`
    INSERT INTO ${rateLimits} (key, count, reset_at)
    VALUES (${key}, 1, now() + ${windowMs} * interval '1 millisecond')
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN ${rateLimits.resetAt} <= now()
                   THEN 1 ELSE ${rateLimits.count} + 1 END,
      reset_at = CASE WHEN ${rateLimits.resetAt} <= now()
                      THEN EXCLUDED.reset_at ELSE ${rateLimits.resetAt} END
    RETURNING count, ${SECONDS_LEFT} AS retry_after
  `);

  const row = result.rows[0]!;
  return {
    count: row.count,
    limited: row.count > limit,
    retryAfterSeconds: row.retry_after,
  };
};

export const peekRateLimit = async ({
  key,
  limit,
}: {
  key: string;
  limit: number;
}): Promise<RateLimitState> => {
  const [row] = await db
    .select({
      count: rateLimits.count,
      retryAfter: sql<number>`${SECONDS_LEFT}`,
    })
    .from(rateLimits)
    .where(and(eq(rateLimits.key, key), gt(rateLimits.resetAt, sql`now()`)))
    .limit(1);

  if (!row) return { count: 0, limited: false, retryAfterSeconds: 0 };
  return {
    count: row.count,
    limited: row.count >= limit,
    retryAfterSeconds: row.retryAfter,
  };
};

export const clearRateLimit = async (key: string) => {
  await db.delete(rateLimits).where(eq(rateLimits.key, key));
};

export const purgeExpiredRateLimits = async () => {
  await db.delete(rateLimits).where(lt(rateLimits.resetAt, sql`now()`));
};
