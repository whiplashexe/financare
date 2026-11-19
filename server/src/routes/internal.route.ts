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

export default internalRoute;
