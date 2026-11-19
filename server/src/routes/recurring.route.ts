import { Router } from "express";
import { authenticate } from "../middlewares/authenticate.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { RecurringValidation } from "../validations/recurring.validation.js";
import { asyncHandler } from "../utils/async.handler.util.js";
import { RecurringController } from "../controllers/recurring.controller.js";

const recurringRoute = Router();

recurringRoute.use(authenticate);

recurringRoute.get(
  "/",
  validate({ query: RecurringValidation.LIST_QUERY }),
  asyncHandler(RecurringController.list),
);

recurringRoute.post(
  "/",
  validate({ body: RecurringValidation.CREATE }),
  asyncHandler(RecurringController.create),
);

recurringRoute.get(
  "/:id",
  validate({ params: RecurringValidation.PARAMS }),
  asyncHandler(RecurringController.get),
);

recurringRoute.patch(
  "/:id",
  validate({
    params: RecurringValidation.PARAMS,
    body: RecurringValidation.UPDATE,
  }),
  asyncHandler(RecurringController.update),
);

recurringRoute.delete(
  "/:id",
  validate({ params: RecurringValidation.PARAMS }),
  asyncHandler(RecurringController.delete),
);

recurringRoute.post(
  "/:id/pause",
  validate({ params: RecurringValidation.PARAMS }),
  asyncHandler(RecurringController.pause),
);

recurringRoute.post(
  "/:id/resume",
  validate({ params: RecurringValidation.PARAMS }),
  asyncHandler(RecurringController.resume),
);

recurringRoute.post(
  "/:id/occurrences/:dueDate/confirm",
  validate({
    params: RecurringValidation.OCCURRENCE_PARAMS,
    body: RecurringValidation.CONFIRM,
  }),
  asyncHandler(RecurringController.confirm),
);

recurringRoute.post(
  "/:id/occurrences/:dueDate/skip",
  validate({ params: RecurringValidation.OCCURRENCE_PARAMS }),
  asyncHandler(RecurringController.skip),
);

export default recurringRoute;
