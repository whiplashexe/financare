import { Router } from "express";
import { validate } from "../middlewares/validate.middleware.js";
import { UserValidation } from "../validations/user.validation.js";
import { asyncHandler } from "../utils/async.handler.util.js";
import { rateLimitByIp } from "../middlewares/rate.limit.middleware.js";
import { AUTH_IP_LIMIT } from "../constants/rate.limit.js";
import { UserController } from "../controllers/user.controller.js";
import { login } from "../services/user/user.login.service.js";

const userRoute = Router();

const authLimiter = rateLimitByIp({ name: "auth", ...AUTH_IP_LIMIT });

userRoute.post(
  "/register",
  authLimiter,
  validate({ body: UserValidation.REGISTER }),
  asyncHandler(UserController.register),
);

userRoute.post(
  "/login",
  authLimiter,
  validate({ body: UserValidation.LOGIN }),
  asyncHandler(UserController.login),
);

export default userRoute;
