import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  index,
  numeric,
  pgSequence,
  pgTable,
  smallint,
  timestamp,
  unique,
  varchar,
} from "drizzle-orm/pg-core";
import { transactions } from "./transactions.js";

export const transactionItemIdSeq = pgSequence("transaction_item_id_seq");

export const transactionItems = pgTable(
  "transaction_item",
  {
    id: varchar("id", { length: 20 })
      .primaryKey()
      .default(
        sql`prefixed_id('ITM', nextval('transaction_item_id_seq'))`,
      ),
    transactionId: varchar("transaction_id", { length: 20 })
      .notNull()
      .references(() => transactions.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 150 }).notNull(),
    quantity: numeric("quantity", { precision: 10, scale: 3, mode: "number" }),
    unit: varchar("unit", { length: 20 }),
    totalPrice: bigint("total_price", { mode: "number" }).notNull(),
    position: smallint("position").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("transaction_item_position_unique").on(t.transactionId, t.position),
    index("transaction_item_transaction_id_idx").on(t.transactionId),
    check("transaction_item_id_format", sql`${t.id} ~ '^ITM[0-9]{3,}$'`),
    check(
      "transaction_item_quantity_range",
      sql`${t.quantity} > 0 AND ${t.quantity} <= 9999999.999`,
    ),
    check(
      "transaction_item_total_price_range",
      sql`${t.totalPrice} BETWEEN 0 AND 999999999999`,
    ),
    check(
      "transaction_item_position_range",
      sql`${t.position} BETWEEN 0 AND 99`,
    ),
  ],
);
