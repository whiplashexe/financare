export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public errors?: Record<string, string[]>,
    public retryAfter?: number
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
