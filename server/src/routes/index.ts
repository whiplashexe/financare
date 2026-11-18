import { Router, type Express } from "express";
import userRoute from "./user.route.js";
import meRoute from "./me.route.js";
import deviceRoute from "./device.route.js";
import accountRoute from "./account.route.js";

const setupRoutes = (app: Express) => {
  const v1 = Router();
  v1.use("/auth", userRoute);
  v1.use("/me", meRoute);
  v1.use("/devices", deviceRoute);
  v1.use("/accounts", accountRoute);
  app.use("/api/v1", v1);
};

export default setupRoutes;
