import {
  check,
  index,
  jsonb,
  pgTable,
  primaryKey,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { users } from "./users.js";
import { sql } from "drizzle-orm";

export const idempotencyKeys = pgTable(
  "idempotency_key",
  {
    key: varchar("key", { length: 64 }).notNull(),
    userId: varchar("user_id", { length: 20 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    route: varchar("route", { length: 100 }).notNull(),
    response: jsonb("response").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({
      name: "idempotency_key_pkey",
      columns: [t.userId, t.key],
    }),
    index("idempotency_key_created_at_idx").on(t.createdAt),
    check("idempotency_key_key_not_empty", sql`length(${t.key}) >= 1`),
    check("idempotency_key_route_not_empty", sql`length(${t.route}) >= 1`),
  ],
);
