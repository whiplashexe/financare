import { Router, type Express } from "express";
import userRoute from "./user.route.js";

const setupRoutes = (app: Express) => {
  const v1 = Router();
  v1.use("/auth", userRoute);
  app.use("/api/v1", v1);
};

export default setupRoutes;
