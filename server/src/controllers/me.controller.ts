import type { Request, Response } from "express";
import MeService from "../services/me/index.js";
import { ApiResponse } from "../utils/api.response.util.js";
import { ME_MESSAGE } from "../constants/response.message.js";
import {
  toNotificationPreferences,
  toProfileResponse,
} from "../utils/profile.util.js";
import {
  ChangePasswordInput,
  DeleteAccountInput,
  NotificationPreferencesInput,
  PreferencesInput,
  UpdateProfileInput,
} from "../validations/me.validation.js";

export class MeController {
  static get = async (req: Request, res: Response) => {
    const profile = await MeService.getProfile({ userId: req.user!.id });
    ApiResponse.ok(res, ME_MESSAGE.PROFILE_FETCHED, toProfileResponse(profile));
  };

  static update = async (
    req: Request<unknown, unknown, UpdateProfileInput>,
    res: Response,
  ) => {
    const profile = await MeService.updateProfile({
      userId: req.user!.id,
      input: req.body,
    });
    ApiResponse.ok(res, ME_MESSAGE.PROFILE_UPDATED, toProfileResponse(profile));
  };

  static changePassword = async (
    req: Request<unknown, unknown, ChangePasswordInput>,
    res: Response,
  ) => {
    await MeService.changePassword({
      userId: req.user!.id,
      sessionId: req.user!.sessionId,
      input: req.body,
    });
    ApiResponse.noContent(res);
  };

  static updateNotificationPreferences = async (
    req: Request<unknown, unknown, NotificationPreferencesInput>,
    res: Response,
  ) => {
    const profile = await MeService.updateNotificationPreferences({
      userId: req.user!.id,
      input: req.body,
    });
    ApiResponse.ok(
      res,
      ME_MESSAGE.NOTIFICATION_PREFERENCES_UPDATED,
      toNotificationPreferences(profile),
    );
  };

  static updatePreferences = async (
    req: Request<unknown, unknown, PreferencesInput>,
    res: Response,
  ) => {
    const row = await MeService.updatePreferences({
      userId: req.user!.id,
      input: req.body,
    });
    ApiResponse.ok(res, ME_MESSAGE.PREFERENCES_UPDATED, {
      hide_balance: row.hideBalance,
    });
  };

  static delete = async (
    req: Request<unknown, unknown, DeleteAccountInput>,
    res: Response,
  ) => {
    await MeService.deleteAccount({ userId: req.user!.id, input: req.body });
    ApiResponse.accepted(res, ME_MESSAGE.ACCOUNT_DELETION_SCHEDULED);
  };
}
