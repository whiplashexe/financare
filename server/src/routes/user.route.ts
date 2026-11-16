import { Router } from "express";
import { validate } from "../middlewares/validate.middleware.js";
import { UserValidation } from "../validations/user.validation.js";
import { asyncHandler } from "../utils/async.handler.util.js";
import { UserController } from "../controllers/user.controller.js";

const userRoute = Router();

userRoute.post(
  "/register",
  validate({ body: UserValidation.REGISTER }),
  asyncHandler(UserController.register),
);

export default userRoute;
