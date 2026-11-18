import { Router } from "express";
import { authenticate } from "../middlewares/authenticate.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { CategoryValidation } from "../validations/category.validation.js";
import { asyncHandler } from "../utils/async.handler.util.js";
import { CategoryController } from "../controllers/category.controller.js";

const categoryRoute = Router();

categoryRoute.use(authenticate);

categoryRoute.get(
  "/",
  validate({ query: CategoryValidation.LIST_QUERY }),
  asyncHandler(CategoryController.list),
);

categoryRoute.post(
  "/",
  validate({ body: CategoryValidation.CREATE }),
  asyncHandler(CategoryController.create),
);

categoryRoute.patch(
  "/:id",
  validate({
    params: CategoryValidation.PARAMS,
    body: CategoryValidation.UPDATE,
  }),
  asyncHandler(CategoryController.update),
);

categoryRoute.delete(
  "/:id",
  validate({
    params: CategoryValidation.PARAMS,
    query: CategoryValidation.DELETE_QUERY,
  }),
  asyncHandler(CategoryController.delete),
);

export default categoryRoute;
