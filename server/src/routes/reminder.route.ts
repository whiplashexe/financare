import { Router } from "express";
import { authenticate } from "../middlewares/authenticate.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { ReminderValidation } from "../validations/reminder.validation.js";
import { asyncHandler } from "../utils/async.handler.util.js";
import { ReminderController } from "../controllers/reminder.controller.js";

const reminderRoute = Router();

reminderRoute.use(authenticate);

reminderRoute.get(
  "/",
  validate({ query: ReminderValidation.LIST_QUERY }),
  asyncHandler(ReminderController.list),
);

reminderRoute.post(
  "/:id/snooze",
  validate({ params: ReminderValidation.PARAMS, body: ReminderValidation.SNOOZE }),
  asyncHandler(ReminderController.snooze),
);

export default reminderRoute;
