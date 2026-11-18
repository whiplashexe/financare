import { describe, expect, it, mock } from "bun:test";
import z, { ZodError } from "zod";
import { validate } from "../../middlewares/validate.middleware.js";

const run = (
  schemas: Parameters<typeof validate>[0],
  parts: { body?: unknown; query?: unknown; params?: unknown },
) => {
  const state = { query: parts.query ?? {} };
  const req: any = {
    body: parts.body,
    params: parts.params ?? {},
    get query() {
      return state.query;
    },
  };
  const next = mock();
  validate(schemas)(req, {} as any, next);
  return { req, next };
};

describe("validate middleware", () => {
  it("replaces req.body with the parsed value", () => {
    const { req, next } = run(
      { body: z.object({ name: z.string().trim() }) },
      { body: { name: "  Apri  " } },
    );

    expect(next).toHaveBeenCalledWith();
    expect(req.body).toEqual({ name: "Apri" });
  });

  it("replaces req.params with the parsed params, not with the query", () => {
    const { req, next } = run(
      {
        params: z.object({ id: z.string().trim() }),
        query: z.object({ page: z.coerce.number() }),
      },
      { params: { id: " ACC001 " }, query: { page: "2" } },
    );

    expect(next).toHaveBeenCalledWith();
    expect(req.params).toEqual({ id: "ACC001" });
  });

  it("replaces a getter-only req.query (Express 5) with the coerced value", () => {
    const { req, next } = run(
      { query: z.object({ limit: z.coerce.number() }) },
      { query: { limit: "20" } },
    );

    expect(next).toHaveBeenCalledWith();
    expect(req.query).toEqual({ limit: 20 });
  });

  it("forwards a ZodError whose paths start with the source", () => {
    const { next } = run(
      { body: z.object({ email: z.email() }) },
      { body: { email: "nope" } },
    );

    const error = next.mock.calls[0]![0] as ZodError;
    expect(error).toBeInstanceOf(ZodError);
    expect(error.issues[0]!.path).toEqual(["body", "email"]);
  });

  it("collects errors from several sources at once", () => {
    const { next } = run(
      {
        body: z.object({ name: z.string().min(1) }),
        query: z.object({ page: z.coerce.number().int().positive() }),
      },
      { body: { name: "" }, query: { page: "0" } },
    );

    const error = next.mock.calls[0]![0] as ZodError;
    const sources = error.issues.map((i) => i.path[0]);
    expect(sources).toContain("body");
    expect(sources).toContain("query");
  });

  it("leaves the parts without a schema untouched", () => {
    const { req } = run(
      { body: z.object({ a: z.string() }) },
      { body: { a: "x" }, params: { id: "keep" } },
    );

    expect(req.params).toEqual({ id: "keep" });
  });
});
