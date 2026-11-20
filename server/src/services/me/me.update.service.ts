import { rescheduleUserReminders } from "../../utils/reminder.util.js";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "../../db/index.js";
import { users } from "../../db/schema/users.js";
import { AUTH_MESSAGE } from "../../constants/response.message.js";
import { ApiError } from "../../utils/api.error.util.js";
import { profileColumns } from "../../utils/profile.util.js";
import { UpdateProfileInput } from "../../validations/me.validation.js";

export const updateProfile = async ({
  userId,
  input,
}: {
  userId: string;
  input: UpdateProfileInput;
}) => {
  const [row] = await db
    .update(users)
    .set({
      ...(input.name !== undefined && { name: input.name }),
      ...(input.timezone !== undefined && { timezone: input.timezone }),
    })
    .where(and(eq(users.id, userId), isNull(users.deletedAt)))
    .returning(profileColumns);

  if (!row) throw ApiError.unauthorized(AUTH_MESSAGE.TOKEN_INVALID);

  if (input.timezone !== undefined) await rescheduleUserReminders(db, userId);

  return row;
};
