import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  index,
  integer,
  pgSequence,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { accounts } from "./accounts.js";
import { categories } from "./categories.js";
import { transactionTypeEnum } from "./enum.js";
import { users } from "./users.js";

export const transactionTemplateIdSeq = pgSequence(
  "transaction_template_id_seq",
);

export const transactionTemplates = pgTable(
  "transaction_template",
  {
    id: varchar("id", { length: 20 })
      .primaryKey()
      .default(
        sql`'TPL' || lpad(nextval('transaction_template_id_seq')::text, 3, '0')`,
      ),
    userId: varchar("user_id", { length: 20 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 50 }).notNull(),
    type: transactionTypeEnum("type").notNull(),
    transactionName: varchar("transaction_name", { length: 100 }).notNull(),
    amount: bigint("amount", { mode: "number" }), // null = isi setiap kali
    accountId: varchar("account_id", { length: 20 }).references(
      () => accounts.id,
      { onDelete: "set null" },
    ),
    toAccountId: varchar("to_account_id", { length: 20 }).references(
      () => accounts.id,
      { onDelete: "set null" },
    ),
    categoryId: varchar("category_id", { length: 20 }).references(
      () => categories.id,
      { onDelete: "set null" },
    ),
    location: varchar("location", { length: 255 }),
    note: text("note"),
    tags: text("tags")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    useCount: integer("use_count").notNull().default(0),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("transaction_template_user_name_unique").on(
      t.userId,
      sql`lower(${t.name})`,
    ),
    index("transaction_template_user_usage_idx").on(
      t.userId,
      t.useCount.desc(),
      t.lastUsedAt.desc(),
    ),
    index("transaction_template_account_idx")
      .on(t.accountId)
      .where(sql`${t.accountId} IS NOT NULL`),
    index("transaction_template_to_account_idx")
      .on(t.toAccountId)
      .where(sql`${t.toAccountId} IS NOT NULL`),
    index("transaction_template_category_idx")
      .on(t.categoryId)
      .where(sql`${t.categoryId} IS NOT NULL`),
    check("transaction_template_id_format", sql`${t.id} ~ '^TPL[0-9]{3,}$'`),
    check(
      "transaction_template_amount_range",
      sql`${t.amount} IS NULL OR (${t.amount} > 0 AND ${t.amount} <= 999999999999)`,
    ),
    check(
      "transaction_template_destination_only_transfer",
      sql`${t.type} = 'TRANSFER' OR ${t.toAccountId} IS NULL`,
    ),
    check(
      "transaction_template_transfer_no_category",
      sql`${t.type} <> 'TRANSFER' OR ${t.categoryId} IS NULL`,
    ),
    check(
      "transaction_template_distinct_accounts",
      sql`${t.accountId} IS NULL OR ${t.toAccountId} IS NULL OR ${t.accountId} <> ${t.toAccountId}`,
    ),
    check("transaction_template_tags_max", sql`cardinality(${t.tags}) <= 10`),
    check("transaction_template_use_count", sql`${t.useCount} >= 0`),
  ],
);
