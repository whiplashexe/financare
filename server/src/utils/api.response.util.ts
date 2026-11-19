import type { Response } from "express";
import { STATUS_CODES, type StatusCode } from "../constants/status.codes.js";

type ApiResponseParams<T> = {
  success: boolean;
  message: string;
  statusCode: StatusCode;
  data?: T | null;
  errors?: unknown;
  pagination?: unknown;
};

export class ApiResponse<T = unknown> {
  public readonly success: boolean;
  public readonly message: string;
  public readonly statusCode: StatusCode;
  public readonly data?: T | null;
  public readonly errors?: unknown;
  public readonly pagination?: unknown;

  constructor({
    success,
    message,
    statusCode,
    data,
    errors,
    pagination,
  }: ApiResponseParams<T>) {
    this.success = success;
    this.message = message;
    this.statusCode = statusCode;
    this.data = data;
    this.errors = errors;
    this.pagination = pagination;
  }

  send(res: Response): Response {
    return res.status(this.statusCode).json({
      success: this.success,
      message: this.message,
      statusCode: this.statusCode,
      ...(this.data !== undefined && { data: this.data }),
      ...(this.errors !== undefined && { errors: this.errors }),
      ...(this.pagination !== undefined && { pagination: this.pagination }),
    });
  }

  static Success<T>(
    res: Response,
    message: string,
    data?: T,
    statusCode: StatusCode = STATUS_CODES.OK,
  ): Response {
    return new ApiResponse<T>({
      success: true,
      message,
      data,
      statusCode,
    }).send(res);
  }

  static ok<T>(res: Response, message = "OK", data?: T) {
    return ApiResponse.Success(res, message, data, STATUS_CODES.OK);
  }

  static list<T>(
    res: Response,
    message: string,
    data: T[],
    pagination: { next_cursor: string | null; limit: number },
  ) {
    return new ApiResponse<T[]>({
      success: true,
      message,
      data,
      statusCode: STATUS_CODES.OK,
      pagination,
    }).send(res);
  }

  static accepted<T>(res: Response, message = "Accepted", data?: T) {
    return ApiResponse.Success(res, message, data, STATUS_CODES.ACCEPTED);
  }

  static noContent(res: Response): Response {
    return res.status(STATUS_CODES.NO_CONTENT).send();
  }

  static created<T>(res: Response, message = "Created", data?: T) {
    return ApiResponse.Success(res, message, data, STATUS_CODES.CREATED);
  }
}
