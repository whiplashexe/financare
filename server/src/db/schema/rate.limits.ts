import {
  index,
  integer,
  pgTable,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

export const rateLimits = pgTable(
  "rate_limit",
  {
    key: varchar("key", { length: 320 }).primaryKey(),
    count: integer("count").notNull(),
    resetAt: timestamp("reset_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("rate_limit_reset_at_idx").on(t.resetAt)],
);
