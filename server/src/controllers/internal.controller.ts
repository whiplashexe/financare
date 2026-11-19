import { timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";
import OneTimeService from "../services/onetime/index.js";
import RecurringService from "../services/recurring/index.js";
import { ApiError } from "../utils/api.error.util.js";
import { ApiResponse } from "../utils/api.response.util.js";

const MIN_SECRET_LENGTH = 16;

const assertCronSecret = (req: Request) => {
  const secret = process.env.CRON_SECRET ?? "";
  const given = (req.get("authorization") ?? "").replace(/^Bearer /i, "");

  const configured = secret.length >= MIN_SECRET_LENGTH;
  const matches =
    configured &&
    given.length === secret.length &&
    timingSafeEqual(Buffer.from(given), Buffer.from(secret));

  if (!matches) throw ApiError.unauthorized("Invalid cron secret");
};

export class InternalController {
  static autoRecordRecurring = async (req: Request, res: Response) => {
    assertCronSecret(req);
    const result = await RecurringService.autoRecord();
    ApiResponse.ok(res, "Recurring plans processed", result);
  };

  static markMissedOneTime = async (req: Request, res: Response) => {
    assertCronSecret(req);
    const result = await OneTimeService.markMissed();
    ApiResponse.ok(res, "One-time plans processed", result);
  };
}
