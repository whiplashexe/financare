import { Router } from "express";
import { asyncHandler } from "../utils/async.handler.util.js";
import { InternalController } from "../controllers/internal.controller.js";

const internalRoute = Router();

internalRoute.get(
  "/cron/recurring-auto-record",
  asyncHandler(InternalController.autoRecordRecurring),
);

internalRoute.get(
  "/cron/one-time-plans-missed",
  asyncHandler(InternalController.markMissedOneTime),
);

internalRoute.get(
  "/cron/image-cleanup",
  asyncHandler(InternalController.cleanupImages),
);

for (const [path, handler] of [
  ["/cron/trash-purge", InternalController.purgeTrash],
  ["/cron/expired-cleanup", InternalController.cleanupExpired],
  ["/cron/account-purge", InternalController.purgeAccounts],
  ["/cron/reminders", InternalController.sendReminders],
  ["/cron/daily", InternalController.daily],
  ["/cron/tick", InternalController.tick],
] as const) {
  internalRoute.get(path, asyncHandler(handler));
}

export default internalRoute;
