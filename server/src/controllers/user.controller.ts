import type { Request, Response } from "express";
import { RegisterInput } from "../validations/user.validation.js";
import UserService from "../services/user/index.js";
import { ApiResponse } from "../utils/api.response.util.js";
import { AUTH_MESSAGE } from "../constants/response.message.js";

export class UserController {
  static register = async (
    req: Request<unknown, unknown, RegisterInput>,
    res: Response,
  ) => {
    const result = await UserService.register({
      input: req.body,
      deviceInfo: req.get("user-agent"),
    });
    ApiResponse.created(res, AUTH_MESSAGE.REGISTER_SUCCESS, result);
  };
}
