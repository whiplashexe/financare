import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { users } from "../db/schema/users.js";
import { AUTH_MESSAGE } from "../constants/response.message.js";
import { ApiError } from "./api.error.util.js";

export const profileColumns = {
  id: users.id,
  name: users.name,
  email: users.email,
  timezone: users.timezone,
  hideBalance: users.hideBalance,
  notifSendTime: users.notifSendTime,
  quietHoursStart: users.quietHoursStart,
  quietHoursEnd: users.quietHoursEnd,
  pushEnabled: users.pushEnabled,
  emailFallback: users.emailFallback,
};

type ProfileRow = {
  id: string;
  name: string;
  email: string;
  timezone: string;
  hideBalance: boolean;
  notifSendTime: string;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  pushEnabled: boolean;
  emailFallback: boolean;
};

const clock = (value: string) => value.slice(0, 5);

export const toNotificationPreferences = (row: ProfileRow) => ({
  send_time: clock(row.notifSendTime),
  quiet_hours:
    row.quietHoursStart && row.quietHoursEnd
      ? { start: clock(row.quietHoursStart), end: clock(row.quietHoursEnd) }
      : null,
  push: row.pushEnabled,
  email_fallback: row.emailFallback,
});

export const toProfileResponse = (row: ProfileRow) => ({
  id: row.id,
  name: row.name,
  email: row.email,
  timezone: row.timezone,
  preferences: { hide_balance: row.hideBalance },
  notification_preferences: toNotificationPreferences(row),
});

export const findActiveProfile = async (userId: string) => {
  const [row] = await db
    .select({ ...profileColumns, deletedAt: users.deletedAt })
    .from(users)
    .where(eq(users.id, userId));

  if (!row || row.deletedAt) {
    throw ApiError.unauthorized(AUTH_MESSAGE.TOKEN_INVALID);
  }
  return row;
};
