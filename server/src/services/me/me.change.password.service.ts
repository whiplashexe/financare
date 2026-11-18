import { and, eq, isNull, ne, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { refreshTokens } from "../../db/schema/refresh.tokens.js";
import { users } from "../../db/schema/users.js";
import { AUTH_MESSAGE } from "../../constants/response.message.js";
import { hashPassword } from "../../utils/password.util.js";
import { assertCurrentPassword } from "../../utils/password.guard.util.js";
import { ChangePasswordInput } from "../../validations/me.validation.js";

export const changePassword = async ({
  userId,
  sessionId,
  input,
}: {
  userId: string;
  sessionId?: string | undefined;
  input: ChangePasswordInput;
}) => {
  await assertCurrentPassword({
    userId,
    password: input.current_password,
    incorrectMessage: AUTH_MESSAGE.OLD_PASSWORD_INCORRECT,
  });

  const passwordHash = await hashPassword(input.new_password);

  await db.transaction(async (tx) => {
    await tx.update(users).set({ passwordHash }).where(eq(users.id, userId));

    await tx
      .update(refreshTokens)
      .set({ revokedAt: sql`now()` })
      .where(
        and(
          eq(refreshTokens.userId, userId),
          isNull(refreshTokens.revokedAt),
          sessionId ? ne(refreshTokens.familyId, sessionId) : undefined,
        ),
      );
  });
};
