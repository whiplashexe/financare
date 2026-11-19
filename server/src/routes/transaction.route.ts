import { Router } from "express";
import { authenticate } from "../middlewares/authenticate.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { TransactionValidation } from "../validations/transaction.validation.js";
import { asyncHandler } from "../utils/async.handler.util.js";
import { TransactionController } from "../controllers/transaction.controller.js";

const transactionRoute = Router();

transactionRoute.use(authenticate);

transactionRoute.get(
  "/",
  validate({ query: TransactionValidation.LIST_QUERY }),
  asyncHandler(TransactionController.list),
);

transactionRoute.get(
  "/trash",
  validate({ query: TransactionValidation.TRASH_QUERY }),
  asyncHandler(TransactionController.trash),
);

transactionRoute.post(
  "/",
  validate({ body: TransactionValidation.CREATE }),
  asyncHandler(TransactionController.create),
);

transactionRoute.get(
  "/:id",
  validate({ params: TransactionValidation.PARAMS }),
  asyncHandler(TransactionController.get),
);

transactionRoute.patch(
  "/:id",
  validate({
    params: TransactionValidation.PARAMS,
    body: TransactionValidation.UPDATE,
  }),
  asyncHandler(TransactionController.update),
);

transactionRoute.delete(
  "/:id",
  validate({
    params: TransactionValidation.PARAMS,
    query: TransactionValidation.DELETE_QUERY,
  }),
  asyncHandler(TransactionController.delete),
);

transactionRoute.post(
  "/:id/restore",
  validate({ params: TransactionValidation.PARAMS }),
  asyncHandler(TransactionController.restore),
);

export default transactionRoute;
