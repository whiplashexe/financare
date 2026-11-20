import { sql, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";

export type RangeBound =
  | { kind: "date"; value: string }
  | { kind: "instant"; value: Date };

export const lowerBound = (
  column: PgColumn,
  bound: RangeBound,
  timezone: string,
): SQL =>
  bound.kind === "date"
    ? sql`${column} >= (${bound.value}::date)::timestamp at time zone ${timezone}`
    : sql`${column} >= ${bound.value.toISOString()}::timestamptz`;

export const upperBound = (
  column: PgColumn,
  bound: RangeBound,
  timezone: string,
): SQL =>
  bound.kind === "date"
    ? sql`${column} < ((${bound.value}::date + 1)::timestamp at time zone ${timezone})`
    : sql`${column} <= ${bound.value.toISOString()}::timestamptz`;

export const rangeOrdered = (from?: RangeBound, to?: RangeBound) => {
  if (!from || !to || from.kind !== to.kind) return true;
  return from.kind === "date"
    ? from.value <= (to.value as string)
    : from.value.getTime() <= (to.value as Date).getTime();
};
