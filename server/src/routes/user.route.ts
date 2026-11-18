import { Router } from "express";
import { validate } from "../middlewares/validate.middleware.js";
import { authenticate } from "../middlewares/authenticate.middleware.js";
import { rateLimitByIp } from "../middlewares/rate.limit.middleware.js";
import { UserValidation } from "../validations/user.validation.js";
import { asyncHandler } from "../utils/async.handler.util.js";
import { AUTH_IP_LIMIT, REFRESH_IP_LIMIT } from "../constants/rate.limit.js";
import { UserController } from "../controllers/user.controller.js";

const userRoute = Router();

const authLimiter = rateLimitByIp({ name: "auth", ...AUTH_IP_LIMIT });
const refreshLimiter = rateLimitByIp({ name: "refresh", ...REFRESH_IP_LIMIT });

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

userRoute.post(
  "/refresh",
  refreshLimiter,
  validate({ body: UserValidation.REFRESH }),
  asyncHandler(UserController.refresh),
);

userRoute.post(
  "/logout",
  refreshLimiter,
  validate({ body: UserValidation.LOGOUT }),
  asyncHandler(UserController.logout),
);

userRoute.post(
  "/logout-all",
  authenticate,
  asyncHandler(UserController.logoutAll),
);

userRoute.post(
  "/forgot-password",
  authLimiter,
  validate({ body: UserValidation.FORGOT_PASSWORD }),
  asyncHandler(UserController.forgotPassword),
);

userRoute.post(
  "/reset-password",
  authLimiter,
  validate({ body: UserValidation.RESET_PASSWORD }),
  asyncHandler(UserController.resetPassword),
);

export default userRoute;
