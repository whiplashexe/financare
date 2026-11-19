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

export default transactionRoute;
