import { STATUS_CODES, type StatusCode } from "@/constants/status.codes";

export class ApiError extends Error {
  public readonly statusCode: StatusCode;
  public readonly isOperational: boolean;
  public readonly errors?: unknown;

  constructor(
    statusCode: StatusCode,
    message: string,
    errors?: unknown,
    isOperational = true,
  ) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.errors = errors;

    Error.captureStackTrace(this, this.constructor);
  }
  static badRequest(message = "bad request", errors?: unknown) {
    return new ApiError(STATUS_CODES.BAD_REQUEST, message, errors);
  }

  static unauthorized(message = "unauthorized") {
    return new ApiError(STATUS_CODES.UNAUTHORIZED, message);
  }

  static forbidden(message = "forbidden") {
    return new ApiError(STATUS_CODES.FORBIDDEN, message);
  }

  static notFound(message = "not found") {
    return new ApiError(STATUS_CODES.NOT_FOUND, message);
  }

  static conflict(message = "conflict") {
    return new ApiError(STATUS_CODES.CONFLICT, message);
  }

  static server(message = "internal server error") {
    return new ApiError(STATUS_CODES.INTERNAL_SERVER_ERROR, message);
  }
}
