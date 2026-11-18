import type { RequestHandler } from "express";
import { API_MESSAGE } from "../constants/response.message.js";
import { ApiError } from "../utils/api.error.util.js";
import { consumeRateLimit } from "../utils/rate.limit.util.js";

export const rateLimitByIp = ({
  name,
  limit,
  windowMs,
}: {
  name: string;
  limit: number;
  windowMs: number;
}): RequestHandler => {
  return async (req, _res, next) => {
    try {
      const state = await consumeRateLimit({
        key: `${name}:ip:${req.ip ?? "unknown"}`,
        limit,
        windowMs,
      });
      if (state.limited) {
        return next(
          ApiError.tooManyRequests(
            API_MESSAGE.TOO_MANY_REQUESTS,
            state.retryAfterSeconds,
          ),
        );
      }
      next();
    } catch (err) {
      next(err);
    }
  };
};
