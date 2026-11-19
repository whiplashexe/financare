import { Router } from "express";
import { authenticate } from "../middlewares/authenticate.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { OneTimeValidation } from "../validations/onetime.validation.js";
import { asyncHandler } from "../utils/async.handler.util.js";
import { OneTimeController } from "../controllers/onetime.controller.js";

const oneTimeRoute = Router();

oneTimeRoute.use(authenticate);

oneTimeRoute.get(
  "/",
  validate({ query: OneTimeValidation.LIST_QUERY }),
  asyncHandler(OneTimeController.list),
);

oneTimeRoute.post(
  "/",
  validate({ body: OneTimeValidation.CREATE }),
  asyncHandler(OneTimeController.create),
);

oneTimeRoute.get(
  "/:id",
  validate({ params: OneTimeValidation.PARAMS }),
  asyncHandler(OneTimeController.get),
);

oneTimeRoute.patch(
  "/:id",
  validate({ params: OneTimeValidation.PARAMS, body: OneTimeValidation.UPDATE }),
  asyncHandler(OneTimeController.update),
);

oneTimeRoute.delete(
  "/:id",
  validate({ params: OneTimeValidation.PARAMS }),
  asyncHandler(OneTimeController.delete),
);

oneTimeRoute.post(
  "/:id/complete",
  validate({ params: OneTimeValidation.PARAMS, body: OneTimeValidation.COMPLETE }),
  asyncHandler(OneTimeController.complete),
);

oneTimeRoute.post(
  "/:id/cancel",
  validate({ params: OneTimeValidation.PARAMS }),
  asyncHandler(OneTimeController.cancel),
);

export default oneTimeRoute;
