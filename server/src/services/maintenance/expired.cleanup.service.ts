import { lt, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { idempotencyKeys } from "../../db/schema/idempotency.keys.js";
import { passwordResetTokens } from "../../db/schema/password.reset.tokens.js";
import { rateLimits } from "../../db/schema/rate.limits.js";
import { refreshTokens } from "../../db/schema/refresh.tokens.js";

export const cleanupExpired = async () => {
  const refresh = await db
    .delete(refreshTokens)
    .where(lt(refreshTokens.expiresAt, sql`now()`))
    .returning({ id: refreshTokens.id });

  const reset = await db
    .delete(passwordResetTokens)
    .where(lt(passwordResetTokens.expiresAt, sql`now()`))
    .returning({ id: passwordResetTokens.id });

  const idempotency = await db
    .delete(idempotencyKeys)
    .where(lt(idempotencyKeys.createdAt, sql`now() - interval '24 hours'`))
    .returning({ key: idempotencyKeys.key });

  const limits = await db
    .delete(rateLimits)
    .where(lt(rateLimits.resetAt, sql`now()`))
    .returning({ key: rateLimits.key });

  return {
    refreshTokens: refresh.length,
    passwordResetTokens: reset.length,
    idempotencyKeys: idempotency.length,
    rateLimits: limits.length,
  };
};
