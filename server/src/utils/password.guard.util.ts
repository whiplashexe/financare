import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { users } from "../db/schema/users.js";
import { LOGIN_FAIL_LIMIT } from "../constants/rate.limit.js";
import { AUTH_MESSAGE } from "../constants/response.message.js";
import { ApiError } from "./api.error.util.js";
import { verifyPassword } from "./password.util.js";
import {
  clearRateLimit,
  consumeRateLimit,
  peekRateLimit,
} from "./rate.limit.util.js";

export const assertCurrentPassword = async ({
  userId,
  password,
  incorrectMessage,
}: {
  userId: string;
  password: string;
  incorrectMessage: string;
}) => {
  const key = `password:fail:${userId}`;

  const lock = await peekRateLimit({ key, ...LOGIN_FAIL_LIMIT });
  if (lock.limited) {
    throw ApiError.tooManyRequests(
      AUTH_MESSAGE.TOO_MANY_LOGIN_ATTEMPTS,
      lock.retryAfterSeconds,
    );
  }

  const [owner] = await db
    .select({ passwordHash: users.passwordHash, deletedAt: users.deletedAt })
    .from(users)
    .where(eq(users.id, userId));

  if (!owner || owner.deletedAt) {
    throw ApiError.unauthorized(AUTH_MESSAGE.TOKEN_INVALID);
  }

  if (!(await verifyPassword(owner.passwordHash, password))) {
    await consumeRateLimit({ key, ...LOGIN_FAIL_LIMIT });
    throw ApiError.unauthorized(incorrectMessage, "PASSWORD_INCORRECT");
  }

  await clearRateLimit(key);
};
