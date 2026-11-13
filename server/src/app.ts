import express, { type Response } from "express";
import cors from "cors";

const app = express();
app.use(express.json());
app.use(cors());

app.get("/", (_, res: Response, __) => {
  res.status(200).json({ status: "ok" });
});

export default app;
