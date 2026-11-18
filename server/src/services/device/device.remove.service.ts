import { and, eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { deviceTokens } from "../../db/schema/device.tokens.js";
import { ME_MESSAGE } from "../../constants/response.message.js";
import { ApiError } from "../../utils/api.error.util.js";

export const removeDevice = async ({
  userId,
  deviceId,
}: {
  userId: string;
  deviceId: string;
}) => {
  const removed = await db
    .delete(deviceTokens)
    .where(and(eq(deviceTokens.id, deviceId), eq(deviceTokens.userId, userId)))
    .returning({ id: deviceTokens.id });

  if (removed.length === 0) throw ApiError.notFound(ME_MESSAGE.DEVICE_NOT_FOUND);
};
