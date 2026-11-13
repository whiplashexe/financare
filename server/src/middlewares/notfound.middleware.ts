import { ApiError } from "@/utils/api.error.util";
import type { Request } from "express";

export const notFoundMiddleware = (req: Request) => {
  throw ApiError.notFound(`route ${req.method} ${req.originalUrl} not found`);
};
