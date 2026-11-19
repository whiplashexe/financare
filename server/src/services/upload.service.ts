import { UPLOAD_SIGN_LIMIT } from "../constants/rate.limit.js";
import { IMAGE_MESSAGE } from "../constants/response.message.js";
import { cloudinaryClient } from "../lib/cloudinary.js";
import { ApiError } from "../utils/api.error.util.js";
import { consumeRateLimit } from "../utils/rate.limit.util.js";

export const signUpload = async ({
  userId,
  count,
}: {
  userId: string;
  count: number;
}) => {
  const state = await consumeRateLimit({
    key: `upload-sign:${userId}`,
    ...UPLOAD_SIGN_LIMIT,
  });
  if (state.limited) {
    throw ApiError.tooManyRequests(IMAGE_MESSAGE.SIGN_LIMIT, state.retryAfterSeconds);
  }

  return cloudinaryClient.sign(userId, count);
};
