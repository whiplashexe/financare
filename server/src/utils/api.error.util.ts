export type FieldErrors = Record<string, string[]>;

export class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code: string,
    public errors?: FieldErrors,
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
  static businessRule(message: string) {
    return new ApiError(422, message, "BUSINESS_RULE");
  }
}
