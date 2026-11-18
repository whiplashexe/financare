import { Router } from "express";
import { authenticate } from "../middlewares/authenticate.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { MeValidation } from "../validations/me.validation.js";
import { asyncHandler } from "../utils/async.handler.util.js";
import { MeController } from "../controllers/me.controller.js";

const meRoute = Router();

meRoute.use(authenticate);

meRoute.get("/", asyncHandler(MeController.get));

meRoute.patch(
  "/",
  validate({ body: MeValidation.UPDATE_PROFILE }),
  asyncHandler(MeController.update),
);

meRoute.post(
  "/password",
  validate({ body: MeValidation.CHANGE_PASSWORD }),
  asyncHandler(MeController.changePassword),
);

meRoute.patch(
  "/notification-preferences",
  validate({ body: MeValidation.NOTIFICATION_PREFERENCES }),
  asyncHandler(MeController.updateNotificationPreferences),
);

meRoute.patch(
  "/preferences",
  validate({ body: MeValidation.PREFERENCES }),
  asyncHandler(MeController.updatePreferences),
);

meRoute.delete(
  "/",
  validate({ body: MeValidation.DELETE_ACCOUNT }),
  asyncHandler(MeController.delete),
);

export default meRoute;
