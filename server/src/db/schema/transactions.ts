import { sql } from "drizzle-orm";
import {
  AnyPgColumn,
  bigint,
  check,
  index,
  pgEnum,
  pgSequence,
  pgTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { users } from "./users.js";
import { accounts } from "./accounts.js";
import { categories } from "./categories.js";

export const transactionTypeEnum = pgEnum("transaction_type", [
  "INCOME",
  "OUTCOME",
  "TRANSFER",
]);

export const transactionSourceEnum = pgEnum("transaction_source", [
  "MANUAL",
  "AUTO",
]);

export const transactionIdSeq = pgSequence("transaction_id_seq");

export const transactions = pgTable(
  "transaction",
  {
    id: varchar("id", { length: 20 })
      .primaryKey()
      .default(
        sql`'TRANS' || lpad(nextval('transaction_id_seq')::text, 3, '0')`,
      ),
    userId: varchar("user_id", { length: 20 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    accountId: varchar("account_id", { length: 20 })
      .notNull()
      .references(() => accounts.id, { onDelete: "restrict" }),
    toAccountId: varchar("to_account_id", { length: 20 }).references(
      () => accounts.id,
      { onDelete: "restrict" },
    ),
    categoryId: varchar("category_id", { length: 20 }).references(
      () => categories.id,
      { onDelete: "set null" },
    ),
    parentTransactionId: varchar("parent_transaction_id", {
      length: 20,
    }).references((): AnyPgColumn => transactions.id, { onDelete: "cascade" }),
    recurringPlanId: varchar("recurring_plan_id", { length: 20 }),
    oneTimePlanId: varchar("one_time_plan_id", { length: 20 }),
    type: transactionTypeEnum("type").notNull(),
    name: varchar("name", { length: 100 }).notNull(),
    amount: bigint("amount", { mode: "number" }).notNull(),
    date: timestamp("date", { withTimezone: true }).notNull().defaultNow(),
    location: varchar("location", { length: 255 }),
    note: text("note"),
    tags: text("tags")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    source: transactionSourceEnum("source").notNull().default("MANUAL"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    check("transaction_id_format", sql`${t.id} ~ '^TRANS[0-9]{3,}$'`),
    check(
      "transaction_amount_range",
      sql`${t.amount} > 0 AND ${t.amount} <= 999999999999`,
    ),
    check(
      "transaction_transfer_has_destination",
      sql`(${t.type} = 'TRANSFER') = (${t.toAccountId} IS NOT NULL)`,
    ),
    check(
      "transaction_distinct_accounts",
      sql`${t.toAccountId} IS NULL OR ${t.accountId} <> ${t.toAccountId}`,
    ),
    check(
      "transaction_transfer_no_category",
      sql`${t.type} <> 'TRANSFER' OR ${t.categoryId} IS NULL`,
    ),
    check(
      "transaction_single_plan",
      sql`NOT (${t.recurringPlanId} IS NOT NULL AND ${t.oneTimePlanId} IS NOT NULL)`,
    ),
    check(
      "transaction_fee_is_outcome",
      sql`${t.parentTransactionId} IS NULL OR ${t.type} = 'OUTCOME'`,
    ),
    check("transaction_tags_max", sql`cardinality(${t.tags}) <= 10`),
    index("transaction_user_date_idx")
      .on(t.userId, t.date.desc())
      .where(sql`${t.deletedAt} IS NULL`),
    index("transaction_account_date_idx")
      .on(t.accountId, t.date.desc())
      .where(sql`${t.deletedAt} IS NULL`),
    index("transaction_to_account_idx")
      .on(t.toAccountId)
      .where(sql`${t.toAccountId} IS NOT NULL`),
    index("transaction_user_category_date_idx").on(
      t.userId,
      t.categoryId,
      t.date,
    ),
    index("transaction_deleted_at_idx")
      .on(t.deletedAt)
      .where(sql`${t.deletedAt} IS NOT NULL`),
    index("transaction_tags_gin_idx").using("gin", t.tags),
  ],
);
