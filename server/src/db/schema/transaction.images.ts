import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgSequence,
  pgTable,
  smallint,
  timestamp,
  unique,
  varchar,
} from "drizzle-orm/pg-core";
import { transactions } from "./transactions.js";

export const transactionImageIdSeq = pgSequence("transaction_image_id_seq");
export const transactionImages = pgTable(
  "transaction_image",
  {
    id: varchar("id", { length: 20 })
      .primaryKey()
      .default(
        sql`prefixed_id('IMG', nextval('transaction_image_id_seq'))`,
      ),
    transactionId: varchar("transaction_id", { length: 20 })
      .notNull()
      .references(() => transactions.id, { onDelete: "cascade" }),
    publicId: varchar("public_id", { length: 255 }).notNull().unique(),
    mimeType: varchar("mime_type", { length: 20 }).notNull(),
    size: integer("size").notNull(),
    position: smallint("position").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("transaction_image_position_unique").on(t.transactionId, t.position),
    index("transaction_image_transaction_id_idx").on(t.transactionId),
    check("transaction_image_id_format", sql`${t.id} ~ '^IMG[0-9]{3,}$'`),
    check(
      "transaction_image_position_range",
      sql`${t.position} BETWEEN 0 AND 4`,
    ),
    check("transaction_image_size_range", sql`${t.size} BETWEEN 1 AND 5242880`),
    check(
      "transaction_image_mime_type",
      sql`${t.mimeType} IN ('image/jpeg', 'image/png', 'image/heic')`,
    ),
  ],
);
