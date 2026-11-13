import { ApiError } from "@/utils/api.error.util";
import type { NextFunction, Request, Response } from "express";

export const notFoundMiddleware = (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  next(ApiError.notFound(`route ${req.method} ${req.originalUrl} not found`));
};
