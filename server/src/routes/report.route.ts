import { Router } from "express";
import { authenticate } from "../middlewares/authenticate.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { ReportValidation } from "../validations/report.validation.js";
import { asyncHandler } from "../utils/async.handler.util.js";
import { DashboardController } from "../controllers/dashboard.controller.js";

const reportRoute = Router();

reportRoute.use(authenticate);

reportRoute.get(
  "/outcome-by-category",
  validate({ query: ReportValidation.RANGE }),
  asyncHandler(DashboardController.outcomeByCategory),
);

reportRoute.get(
  "/monthly-trend",
  validate({ query: ReportValidation.TREND }),
  asyncHandler(DashboardController.monthlyTrend),
);

reportRoute.get(
  "/account-flow",
  validate({ query: ReportValidation.FLOW }),
  asyncHandler(DashboardController.accountFlow),
);

export default reportRoute;
