import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { deviceTokens } from "../../db/schema/device.tokens.js";
import { refreshTokens } from "../../db/schema/refresh.tokens.js";
import { users } from "../../db/schema/users.js";
import { AUTH_MESSAGE } from "../../constants/response.message.js";
import { assertCurrentPassword } from "../../utils/password.guard.util.js";
import { DeleteAccountInput } from "../../validations/me.validation.js";

export const deleteAccount = async ({
  userId,
  input,
}: {
  userId: string;
  input: DeleteAccountInput;
}) => {
  await assertCurrentPassword({
    userId,
    password: input.password,
    incorrectMessage: AUTH_MESSAGE.PASSWORD_INCORRECT,
  });

  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ deletedAt: sql`now()` })
      .where(and(eq(users.id, userId), isNull(users.deletedAt)));

    await tx
      .update(refreshTokens)
      .set({ revokedAt: sql`now()` })
      .where(
        and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)),
      );

    await tx.delete(deviceTokens).where(eq(deviceTokens.userId, userId));
  });
};
