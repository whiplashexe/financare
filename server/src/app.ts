import express, { type Response } from "express";
import cors from "cors";
import { notFoundMiddleware } from "@/middlewares/notfound.middleware";
import { errorMiddleware } from "@/middlewares/error.middleware";

const app = express();
app.use(express.json());
app.use(cors());

app.get("/", (_, res: Response, __) => {
  res.status(200).json({ status: "ok" });
});

app.use(notFoundMiddleware);
app.use(errorMiddleware);

export default app;
