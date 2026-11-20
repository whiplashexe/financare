import type { Request, Response } from "express";
import ReminderService from "../services/reminder/index.js";
import { ApiResponse } from "../utils/api.response.util.js";
import { REMINDER_MESSAGE } from "../constants/response.message.js";
import { toReminderResponse } from "../utils/reminder.view.util.js";
import {
  ListRemindersQuery,
  SnoozeInput,
} from "../validations/reminder.validation.js";

export class ReminderController {
  static list = async (req: Request, res: Response) => {
    const rows = await ReminderService.list({
      userId: req.user!.id,
      query: req.query as unknown as ListRemindersQuery,
    });
    ApiResponse.ok(res, REMINDER_MESSAGE.LISTED, rows.map(toReminderResponse));
  };

  static snooze = async (
    req: Request<{ id: string }, unknown, SnoozeInput>,
    res: Response,
  ) => {
    const row = await ReminderService.snooze({
      userId: req.user!.id,
      reminderId: req.params.id,
      input: req.body,
    });
    ApiResponse.ok(res, REMINDER_MESSAGE.SNOOZED, toReminderResponse(row));
  };
}
