import type { RequestHandler } from "express";
import { eq } from "drizzle-orm";
import { errors, jwtVerify } from "jose";
import { env } from "../config/env.js";
import { db } from "../db/index.js";
import { users } from "../db/schema/users.js";
import { AUTH_MESSAGE } from "../constants/response.message.js";
import { ApiError } from "../utils/api.error.util.js";

const accessSecret = new TextEncoder().encode(env?.JWT_ACCESS_SECRET);

export const authenticate: RequestHandler = async (req, _res, next) => {
  try {
    const [scheme, token] = (req.get("authorization") ?? "").split(" ");
    if (scheme?.toLowerCase() !== "bearer" || !token) {
      throw ApiError.unauthorized(AUTH_MESSAGE.TOKEN_MISSING);
    }

    const { payload } = await jwtVerify(token, accessSecret, {
      algorithms: ["HS256"],
    }).catch((err: unknown) => {
      if (err instanceof errors.JWTExpired) {
        throw ApiError.unauthorized(AUTH_MESSAGE.TOKEN_EXPIRED, "TOKEN_EXPIRED");
      }
      throw ApiError.unauthorized(AUTH_MESSAGE.TOKEN_INVALID);
    });

    if (!payload.sub) throw ApiError.unauthorized(AUTH_MESSAGE.TOKEN_INVALID);

    const [owner] = await db
      .select({ deletedAt: users.deletedAt })
      .from(users)
      .where(eq(users.id, payload.sub));

    if (!owner || owner.deletedAt) {
      throw ApiError.unauthorized(AUTH_MESSAGE.TOKEN_INVALID);
    }

    req.user = {
      id: payload.sub,
      sessionId: typeof payload.sid === "string" ? payload.sid : undefined,
    };
    next();
  } catch (err) {
    next(err);
  }
};
