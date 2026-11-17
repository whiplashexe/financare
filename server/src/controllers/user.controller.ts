import type { Request, Response } from "express";
import { RegisterInput } from "../validations/user.validation.js";
import UserService from "../services/user/index.js";
import { ApiResponse } from "../utils/api.response.util.js";
import { AUTH_MESSAGE } from "../constants/response.message.js";
import { ACCESS_TTL_SECONDS } from "../utils/token.util.js";

export class UserController {
  static register = async (
    req: Request<unknown, unknown, RegisterInput>,
    res: Response,
  ) => {
    const { user, accessToken, refreshToken } = await UserService.register({
      input: req.body,
      deviceInfo: req.get("user-agent"),
    });

    ApiResponse.created(res, AUTH_MESSAGE.REGISTER_SUCCESS, {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        timezone: user.timezone,
      },
      access_token: accessToken,
      access_expires_in: ACCESS_TTL_SECONDS,
      refresh_token: refreshToken,
    });
  };
}
