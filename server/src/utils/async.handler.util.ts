import type { NextFunction, Request, RequestHandler, Response } from "express";

export const asyncHandler = <Req extends Request<any, any, any, any>>(
  fn: (req: Req, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler => {
  return function (req, res, next) {
    Promise.resolve()
      .then(() => fn(req as unknown as Req, res, next))
      .catch(next);
  };
};
