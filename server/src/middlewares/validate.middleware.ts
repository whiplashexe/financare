import { RequestHandler } from "express";
import z, { type ZodType } from "zod";

type Schemas = {
  body?: ZodType;
  query?: ZodType;
  params?: ZodType;
};

export const validate = (schemas: Schemas): RequestHandler => {
  const shape = Object.fromEntries(
    Object.entries(schemas).filter(([, schema]) => schema),
  ) as Record<string, ZodType>;
  const schema = z.object(shape);
  return (req, _res, next) => {
    const result = schema.safeParse({
      body: req.body,
      query: req.query,
      params: req.params,
    });

    if (!result.success) return next(result.error);

    const data = result.data as {
      body?: unknown;
      query?: unknown;
      params?: unknown;
    };

    if (data.body !== undefined) req.body = data.body;
    if (data.params !== undefined) req.params = data.params as typeof req.params;
    if (data.query !== undefined) {
      Object.defineProperty(req, "query", {
        value: data.query,
        writable: true,
        configurable: true,
        enumerable: true,
      });
    }
    next();
  };
};
