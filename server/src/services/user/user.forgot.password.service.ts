import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { passwordResetTokens } from "../../db/schema/password.reset.tokens.js";
import { users } from "../../db/schema/users.js";
import { FORGOT_PASSWORD_LIMIT } from "../../constants/rate.limit.js";
import { sendPasswordResetEmail } from "../../lib/mailer.js";
import { consumeRateLimit } from "../../utils/rate.limit.util.js";
import {
  generateOpaqueToken,
  PASSWORD_RESET_TTL_MINUTES,
} from "../../utils/token.util.js";
import { ForgotPasswordInput } from "../../validations/user.validation.js";

export const forgotPassword = async ({
  input,
}: {
  input: ForgotPasswordInput;
}) => {
  const email = input.email.toLowerCase();

  const throttle = await consumeRateLimit({
    key: `forgot:${email}`,
    ...FORGOT_PASSWORD_LIMIT,
  });
  if (throttle.limited) return;

  const [found] = await db
    .select({ id: users.id, email: users.email, deletedAt: users.deletedAt })
    .from(users)
    .where(sql`lower(${users.email}) = ${email}`)
    .limit(1);

  if (!found || found.deletedAt) return;

  const token = generateOpaqueToken();

  await db.transaction(async (tx) => {
    await tx
      .delete(passwordResetTokens)
      .where(
        and(
          eq(passwordResetTokens.userId, found.id),
          isNull(passwordResetTokens.usedAt),
        ),
      );

    await tx.insert(passwordResetTokens).values({
      userId: found.id,
      tokenHash: token.hash,
      expiresAt: sql`now() + ${PASSWORD_RESET_TTL_MINUTES} * interval '1 minute'`,
    });
  });

  await sendPasswordResetEmail({ to: found.email, token: token.raw });
};
