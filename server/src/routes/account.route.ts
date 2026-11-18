import { Router } from "express";
import { authenticate } from "../middlewares/authenticate.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { AccountValidation } from "../validations/account.validation.js";
import { asyncHandler } from "../utils/async.handler.util.js";
import { AccountController } from "../controllers/account.controller.js";

const accountRoute = Router();

accountRoute.use(authenticate);

accountRoute.get(
  "/",
  validate({ query: AccountValidation.LIST_QUERY }),
  asyncHandler(AccountController.list),
);

accountRoute.post(
  "/",
  validate({ body: AccountValidation.CREATE }),
  asyncHandler(AccountController.create),
);

accountRoute.get(
  "/:id",
  validate({ params: AccountValidation.PARAMS }),
  asyncHandler(AccountController.get),
);

accountRoute.patch(
  "/:id",
  validate({ params: AccountValidation.PARAMS, body: AccountValidation.UPDATE }),
  asyncHandler(AccountController.update),
);

accountRoute.delete(
  "/:id",
  validate({ params: AccountValidation.PARAMS }),
  asyncHandler(AccountController.delete),
);

accountRoute.post(
  "/:id/archive",
  validate({ params: AccountValidation.PARAMS }),
  asyncHandler(AccountController.archive),
);

accountRoute.post(
  "/:id/unarchive",
  validate({ params: AccountValidation.PARAMS }),
  asyncHandler(AccountController.unarchive),
);

export default accountRoute;
