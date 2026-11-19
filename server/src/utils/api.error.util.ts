export type FieldErrors = Record<string, string[]>;

export class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code: string,
    public errors?: FieldErrors,
    public retryAfterSeconds?: number,
    public data?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }

  static badRequest(message: string, errors?: FieldErrors) {
    return new ApiError(400, message, "VALIDATION_ERROR", errors);
  }
  static unauthorized(message = "Unauthorized", code = "UNAUTHORIZED") {
    return new ApiError(401, message, code);
  }
  static notFound(message = "Not found") {
    return new ApiError(404, message, "NOT_FOUND");
  }
  static conflict(message: string) {
    return new ApiError(409, message, "CONFLICT");
  }
  static tooManyRequests(message: string, retryAfterSeconds?: number) {
    return new ApiError(
      429,
      message,
      "RATE_LIMITED",
      undefined,
      retryAfterSeconds,
    );
  }
  static confirmationRequired(message: string, data: unknown) {
    return new ApiError(
      422,
      message,
      "CONFIRMATION_REQUIRED",
      undefined,
      undefined,
      data,
    );
  }
  static businessRule(message: string, data?: unknown) {
    return new ApiError(
      422,
      message,
      "BUSINESS_RULE",
      undefined,
      undefined,
      data,
    );
  }
}
