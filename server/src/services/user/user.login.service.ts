import { sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { users } from "../../db/schema/users.js";
import { LoginInput } from "../../validations/user.validation.js";
import { ApiError } from "../../utils/api.error.util.js";
import { AUTH_MESSAGE } from "../../constants/response.message.js";
import { getDummyHash, verifyPassword } from "../../utils/password.util.js";
import { LOGIN_FAIL_LIMIT } from "../../constants/rate.limit.js";
import {
  clearRateLimit,
  consumeRateLimit,
  peekRateLimit,
} from "../../utils/rate.limit.util.js";
import {
  createSession,
  describeDevice,
} from "../../utils/auth.session.util.js";

export const login = async ({
  input,
  deviceInfo,
  ip,
}: {
  input: LoginInput;
  deviceInfo?: string | undefined;
  ip?: string | undefined;
}) => {
  const failKey = `login:fail:${input.email.toLowerCase()}:${ip ?? "unknown"}`;

  const lock = await peekRateLimit({ key: failKey, ...LOGIN_FAIL_LIMIT });
  if (lock.limited) {
    throw ApiError.tooManyRequests(
      AUTH_MESSAGE.TOO_MANY_LOGIN_ATTEMPTS,
      lock.retryAfterSeconds,
    );
  }

  const [found] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      timezone: users.timezone,
      passwordHash: users.passwordHash,
      deletedAt: users.deletedAt,
    })
    .from(users)
    .where(sql`lower(${users.email}) = ${input.email.toLowerCase()}`)
    .limit(1);

  const invalid = () => ApiError.unauthorized(AUTH_MESSAGE.INVALID_CREDENTIALS);

  const usable = found && !found.deletedAt ? found : undefined;

  const passwordOk = await verifyPassword(
    usable ? usable.passwordHash : await getDummyHash(),
    input.password,
  );

  if (!usable || !passwordOk) {
    await consumeRateLimit({ key: failKey, ...LOGIN_FAIL_LIMIT });
    throw invalid();
  }

  await clearRateLimit(failKey);

  const session = await createSession({
    userId: usable.id,
    deviceInfo: describeDevice(input.device, deviceInfo),
  });

  return {
    user: {
      id: usable.id,
      name: usable.name,
      email: usable.email,
      timezone: usable.timezone,
    },
    ...session,
  };
};
