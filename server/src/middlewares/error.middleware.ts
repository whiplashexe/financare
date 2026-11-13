import { env } from "@/config/env";
import { logger } from "@/lib/logger";
import { ApiError, type FieldErrors } from "@/utils/api.error.util";
import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";

function formatZodErrors(error: ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.slice(1).join(".") || String(issue.path[0] ?? "_");
    (out[key] ??= []).push(issue.message);
  }
  return out;
}

function pgCode(err: unknown): string | undefined {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code ?? e?.cause?.code;
}

export const errorMiddleware: ErrorRequestHandler = (err, _req, res, _next) => {
  let statusCode = 500;
  let message = "internal server error";
  let code = "INTERNAL_ERROR";
  let errors: FieldErrors | undefined;

  if (err instanceof ApiError) {
    ({ statusCode, message, code, errors } = err);
  } else if (err instanceof ZodError) {
    statusCode = 400;
    message = "invalid request data";
    code = "VALIDATION_ERROR";
    errors = formatZodErrors(err);
  } else if (err instanceof SyntaxError && "body" in err) {
    statusCode = 400;
    message = "invalid json body";
    code = "VALIDATION_ERROR";
  } else {
    const pg = pgCode(err);
    if (pg === "23505") {
      statusCode = 409;
      message = "data already exist";
      code = "CONFLICT";
    } else if (pg === "23503") {
      statusCode = 409;
      message = "Related data conflict";
      code = "CONFLICT";
    }
  }
  if (statusCode >= 500) logger.error(err);
  else logger.warn(message, { statusCode, code });

  res.status(statusCode).json({
    success: false,
    message,
    statusCode,
    code,
    ...(errors && { errors }),
    ...(env?.NODE_ENV === "development" && { stack: err.stack }),
  });
};
