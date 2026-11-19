import { Router } from "express";
import { asyncHandler } from "../utils/async.handler.util.js";
import { InternalController } from "../controllers/internal.controller.js";

const internalRoute = Router();

internalRoute.get(
  "/cron/recurring-auto-record",
  asyncHandler(InternalController.autoRecordRecurring),
);

export default internalRoute;
