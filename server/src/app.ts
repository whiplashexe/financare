import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";

const app = express();

app.get("/", (_, res: Response, __) => {
  res.status(200).json({ status: "ok" });
});

export default app;
