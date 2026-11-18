import type { Request, Response } from "express";
import {
  ForgotPasswordInput,
  LoginInput,
  LogoutInput,
  RefreshInput,
  RegisterInput,
  ResetPasswordInput,
} from "../validations/user.validation.js";
import UserService from "../services/user/index.js";
import { ApiResponse } from "../utils/api.response.util.js";
import { AUTH_MESSAGE } from "../constants/response.message.js";
import { toAuthResponse, toTokenResponse } from "../utils/auth.session.util.js";

export class UserController {
  static register = async (
    req: Request<unknown, unknown, RegisterInput>,
    res: Response,
  ) => {
    const result = await UserService.register({
      input: req.body,
      deviceInfo: req.get("user-agent"),
    });
    ApiResponse.created(
      res,
      AUTH_MESSAGE.REGISTER_SUCCESS,
      toAuthResponse(result),
    );
  };

  static login = async (
    req: Request<unknown, unknown, LoginInput>,
    res: Response,
  ) => {
    const result = await UserService.login({
      input: req.body,
      deviceInfo: req.get("user-agent"),
      ip: req.ip,
    });
    ApiResponse.ok(res, AUTH_MESSAGE.LOGIN_SUCCESS, toAuthResponse(result));
  };

  static refresh = async (
    req: Request<unknown, unknown, RefreshInput>,
    res: Response,
  ) => {
    const result = await UserService.refresh({ input: req.body });
    ApiResponse.ok(res, AUTH_MESSAGE.TOKEN_REFRESHED, toTokenResponse(result));
  };

  static logout = async (
    req: Request<unknown, unknown, LogoutInput>,
    res: Response,
  ) => {
    await UserService.logout({ input: req.body });
    ApiResponse.noContent(res);
  };

  static logoutAll = async (req: Request, res: Response) => {
    await UserService.logoutAll({ userId: req.user!.id });
    ApiResponse.noContent(res);
  };

  static forgotPassword = async (
    req: Request<unknown, unknown, ForgotPasswordInput>,
    res: Response,
  ) => {
    await UserService.forgotPassword({ input: req.body });
    ApiResponse.accepted(res, AUTH_MESSAGE.PASSWORD_RESET_REQUESTED);
  };

  static resetPassword = async (
    req: Request<unknown, unknown, ResetPasswordInput>,
    res: Response,
  ) => {
    await UserService.resetPassword({ input: req.body });
    ApiResponse.noContent(res);
  };
}
