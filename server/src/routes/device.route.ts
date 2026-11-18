import { Router } from "express";
import { authenticate } from "../middlewares/authenticate.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { DeviceValidation } from "../validations/device.validation.js";
import { asyncHandler } from "../utils/async.handler.util.js";
import { DeviceController } from "../controllers/device.controller.js";

const deviceRoute = Router();

deviceRoute.use(authenticate);

deviceRoute.post(
  "/",
  validate({ body: DeviceValidation.REGISTER }),
  asyncHandler(DeviceController.register),
);

deviceRoute.delete(
  "/:id",
  validate({ params: DeviceValidation.PARAMS }),
  asyncHandler(DeviceController.remove),
);

export default deviceRoute;
