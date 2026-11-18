import { and, eq, isNull } from "drizzle-orm";
import { db } from "../../db/index.js";
import { users } from "../../db/schema/users.js";
import { AUTH_MESSAGE } from "../../constants/response.message.js";
import { ApiError } from "../../utils/api.error.util.js";
import { profileColumns } from "../../utils/profile.util.js";
import { NotificationPreferencesInput } from "../../validations/me.validation.js";

export const updateNotificationPreferences = async ({
  userId,
  input,
}: {
  userId: string;
  input: NotificationPreferencesInput;
}) => {
  const [row] = await db
    .update(users)
    .set({
      ...(input.send_time !== undefined && { notifSendTime: input.send_time }),
      ...(input.quiet_hours !== undefined && {
        quietHoursStart: input.quiet_hours?.start ?? null,
        quietHoursEnd: input.quiet_hours?.end ?? null,
      }),
      ...(input.push !== undefined && { pushEnabled: input.push }),
      ...(input.email_fallback !== undefined && {
        emailFallback: input.email_fallback,
      }),
    })
    .where(and(eq(users.id, userId), isNull(users.deletedAt)))
    .returning(profileColumns);

  if (!row) throw ApiError.unauthorized(AUTH_MESSAGE.TOKEN_INVALID);
  return row;
};
