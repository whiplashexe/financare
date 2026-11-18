import { and, eq, isNull } from "drizzle-orm";
import { db } from "../../db/index.js";
import { users } from "../../db/schema/users.js";
import { AUTH_MESSAGE } from "../../constants/response.message.js";
import { ApiError } from "../../utils/api.error.util.js";
import { PreferencesInput } from "../../validations/me.validation.js";

export const updatePreferences = async ({
  userId,
  input,
}: {
  userId: string;
  input: PreferencesInput;
}) => {
  const [row] = await db
    .update(users)
    .set({ hideBalance: input.hide_balance })
    .where(and(eq(users.id, userId), isNull(users.deletedAt)))
    .returning({ hideBalance: users.hideBalance });

  if (!row) throw ApiError.unauthorized(AUTH_MESSAGE.TOKEN_INVALID);
  return row;
};
