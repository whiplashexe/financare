import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { passwordResetTokens } from "../../db/schema/password.reset.tokens.js";
import { refreshTokens } from "../../db/schema/refresh.tokens.js";
import { users } from "../../db/schema/users.js";
import { AUTH_MESSAGE } from "../../constants/response.message.js";
import { ApiError } from "../../utils/api.error.util.js";
import { hashPassword } from "../../utils/password.util.js";
import { hashToken } from "../../utils/token.util.js";
import { ResetPasswordInput } from "../../validations/user.validation.js";

export const resetPassword = async ({
  input,
}: {
  input: ResetPasswordInput;
}) => {
  const passwordHash = await hashPassword(input.new_password);

  const valid = await db.transaction(async (tx) => {
    const [row] = await tx
      .select({
        id: passwordResetTokens.id,
        userId: passwordResetTokens.userId,
        usable: sql<boolean>`${passwordResetTokens.usedAt} is null and ${passwordResetTokens.expiresAt} > now()`,
      })
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.tokenHash, hashToken(input.token)))
      .for("update");

    if (!row || !row.usable) return false;

    const updated = await tx
      .update(users)
      .set({ passwordHash })
      .where(and(eq(users.id, row.userId), isNull(users.deletedAt)))
      .returning({ id: users.id });

    if (updated.length === 0) return false;

    await tx
      .update(passwordResetTokens)
      .set({ usedAt: sql`now()` })
      .where(
        and(
          eq(passwordResetTokens.userId, row.userId),
          isNull(passwordResetTokens.usedAt),
        ),
      );

    await tx
      .update(refreshTokens)
      .set({ revokedAt: sql`now()` })
      .where(
        and(
          eq(refreshTokens.userId, row.userId),
          isNull(refreshTokens.revokedAt),
        ),
      );

    return true;
  });

  if (!valid) {
    throw ApiError.badRequest(AUTH_MESSAGE.RESET_TOKEN_INVALID, {
      token: [AUTH_MESSAGE.RESET_TOKEN_INVALID],
    });
  }
};
