import { Router } from "express";
import { authenticate } from "../middlewares/authenticate.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { TemplateValidation } from "../validations/template.validation.js";
import { asyncHandler } from "../utils/async.handler.util.js";
import { TemplateController } from "../controllers/template.controller.js";

const templateRoute = Router();

templateRoute.use(authenticate);

templateRoute.get("/", asyncHandler(TemplateController.list));

templateRoute.post(
  "/",
  validate({ body: TemplateValidation.CREATE }),
  asyncHandler(TemplateController.create),
);

templateRoute.get(
  "/:id",
  validate({ params: TemplateValidation.PARAMS }),
  asyncHandler(TemplateController.get),
);

templateRoute.patch(
  "/:id",
  validate({ params: TemplateValidation.PARAMS, body: TemplateValidation.UPDATE }),
  asyncHandler(TemplateController.update),
);

templateRoute.delete(
  "/:id",
  validate({ params: TemplateValidation.PARAMS }),
  asyncHandler(TemplateController.delete),
);

templateRoute.post(
  "/:id/record",
  validate({ params: TemplateValidation.PARAMS, body: TemplateValidation.RECORD }),
  asyncHandler(TemplateController.record),
);

export default templateRoute;
