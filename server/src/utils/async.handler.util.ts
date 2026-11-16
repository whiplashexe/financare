import type { Request, Response, NextFunction } from "express";

export type AsyncRouteHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
) => Promise<unknown>;

export const asyncHandler = (fn: AsyncRouteHandler) => {
  return function (req: Request, res: Response, next: NextFunction) {
    Promise.resolve()
      .then(() => fn(req, res, next))
      .catch(next);
  };
};
