import { Router } from "express";
import { authenticate } from "../middlewares/authenticate.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { TransactionValidation } from "../validations/transaction.validation.js";
import { asyncHandler } from "../utils/async.handler.util.js";
import { UploadController } from "../controllers/upload.controller.js";

const uploadRoute = Router();

uploadRoute.use(authenticate);

uploadRoute.post(
  "/sign",
  validate({ body: TransactionValidation.SIGN }),
  asyncHandler(UploadController.sign),
);

export default uploadRoute;
