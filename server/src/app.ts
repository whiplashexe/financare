import express, { type Response } from "express";
import cors from "cors";
import { notFoundMiddleware } from "./middlewares/notfound.middleware.js";
import { errorMiddleware } from "./middlewares/error.middleware.js";
import setupRoutes from "./routes/index.js";

const app = express();
app.set("trust proxy", 1);
app.use(express.json());
app.use(cors());

app.get("/", (_, res: Response, __) => {
  res.status(200).json({ status: "ok" });
});

setupRoutes(app);

app.use(notFoundMiddleware);
app.use(errorMiddleware);

export default app;
