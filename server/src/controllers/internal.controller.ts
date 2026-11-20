import { timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";
import { logger } from "../lib/logger.js";
import { cleanupOrphanImages } from "../services/image.cleanup.service.js";
import { purgeDeletedAccounts } from "../services/maintenance/account.purge.service.js";
import { cleanupExpired } from "../services/maintenance/expired.cleanup.service.js";
import { purgeTrash } from "../services/maintenance/trash.purge.service.js";
import { deliverReminders } from "../services/reminder/reminder.delivery.service.js";
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

  static cleanupImages = async (req: Request, res: Response) => {
    assertCronSecret(req);
    const result = await cleanupOrphanImages();
    ApiResponse.ok(res, "Orphan images processed", result);
  };

  static purgeTrash = async (req: Request, res: Response) => {
    assertCronSecret(req);
    ApiResponse.ok(res, "Trash purged", await purgeTrash());
  };

  static cleanupExpired = async (req: Request, res: Response) => {
    assertCronSecret(req);
    ApiResponse.ok(res, "Expired records removed", await cleanupExpired());
  };

  static purgeAccounts = async (req: Request, res: Response) => {
    assertCronSecret(req);
    ApiResponse.ok(res, "Deleted accounts purged", await purgeDeletedAccounts());
  };

  static sendReminders = async (req: Request, res: Response) => {
    assertCronSecret(req);
    ApiResponse.ok(res, "Reminders processed", await deliverReminders());
  };

  static daily = async (req: Request, res: Response) => {
    assertCronSecret(req);
    ApiResponse.ok(
      res,
      "Daily jobs processed",
      await runSteps([
        ["oneTimePlansMissed", () => OneTimeService.markMissed()],
        ["trashPurge", purgeTrash],
        ["expiredCleanup", cleanupExpired],
        ["imageCleanup", cleanupOrphanImages],
        ["accountPurge", purgeDeletedAccounts],
      ]),
    );
  };

  static tick = async (req: Request, res: Response) => {
    assertCronSecret(req);
    ApiResponse.ok(
      res,
      "Scheduled jobs processed",
      await runSteps([
        ["recurringAutoRecord", () => RecurringService.autoRecord()],
        ["reminders", deliverReminders],
      ]),
    );
  };
}

const runSteps = async (steps: [string, () => Promise<unknown>][]) => {
  const results: Record<string, unknown> = {};

  for (const [name, run] of steps) {
    try {
      results[name] = await run();
    } catch (error) {
      logger.error("scheduled job failed", { job: name, error: String(error) });
      results[name] = {
        error: error instanceof ApiError ? error.code : "INTERNAL_ERROR",
      };
    }
  }

  return results;
};
