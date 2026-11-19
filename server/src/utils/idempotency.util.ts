import { and, eq, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { idempotencyKeys } from "../db/schema/idempotency.keys.js";
import { ApiError } from "./api.error.util.js";

export type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export const readIdempotencyKey = (req: {
  get(name: string): string | undefined;
}) => {
  const key = req.get("idempotency-key");
  if (key !== undefined && (key.length < 1 || key.length > 64)) {
    throw ApiError.badRequest("Invalid Idempotency-Key header", {
      "idempotency-key": ["must be 1 to 64 characters"],
    });
  }
  return key;
};

export const findStoredResponse = async (
  tx: DbTx,
  userId: string,
  key: string,
  route: string,
) => {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtext(${`${userId}:${key}`}))`,
  );
  await tx
    .delete(idempotencyKeys)
    .where(
      and(
        eq(idempotencyKeys.userId, userId),
        eq(idempotencyKeys.key, key),
        sql`${idempotencyKeys.createdAt} <= now() - interval '24 hours'`,
      ),
    );

  const [stored] = await tx
    .select({ response: idempotencyKeys.response, route: idempotencyKeys.route })
    .from(idempotencyKeys)
    .where(and(eq(idempotencyKeys.userId, userId), eq(idempotencyKeys.key, key)));

  if (!stored) return null;
  if (stored.route !== route) {
    throw ApiError.conflict(
      "This Idempotency-Key was already used for another request",
    );
  }
  return stored.response;
};

export const storeResponse = async (
  tx: DbTx,
  userId: string,
  key: string,
  route: string,
  data: unknown,
) => {
  await tx
    .insert(idempotencyKeys)
    .values({ userId, key, route, response: data });
};
