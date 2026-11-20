import { Router } from "express";
import { authenticate } from "../middlewares/authenticate.middleware.js";
import { asyncHandler } from "../utils/async.handler.util.js";
import { DashboardController } from "../controllers/dashboard.controller.js";

const dashboardRoute = Router();

dashboardRoute.use(authenticate);

dashboardRoute.get("/", asyncHandler(DashboardController.dashboard));

export default dashboardRoute;
