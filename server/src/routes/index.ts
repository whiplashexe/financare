import { Router, type Express } from "express";
import userRoute from "./user.route.js";
import meRoute from "./me.route.js";
import deviceRoute from "./device.route.js";
import accountRoute from "./account.route.js";
import categoryRoute from "./category.route.js";
import transactionRoute from "./transaction.route.js";
import templateRoute from "./template.route.js";
import recurringRoute from "./recurring.route.js";
import oneTimeRoute from "./onetime.route.js";
import internalRoute from "./internal.route.js";

const setupRoutes = (app: Express) => {
  const v1 = Router();
  v1.use("/auth", userRoute);
  v1.use("/me", meRoute);
  v1.use("/devices", deviceRoute);
  v1.use("/accounts", accountRoute);
  v1.use("/categories", categoryRoute);
  v1.use("/transactions", transactionRoute);
  v1.use("/templates", templateRoute);
  v1.use("/recurring-plans", recurringRoute);
  v1.use("/one-time-plans", oneTimeRoute);
  v1.use("/internal", internalRoute);
  app.use("/api/v1", v1);
};

export default setupRoutes;
