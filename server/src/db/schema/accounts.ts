import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  char,
  check,
  index,
  pgEnum,
  pgSequence,
  pgTable,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { users } from "./users.js";

export const accountTypeEnum = pgEnum("account_type", [
  "BANK",
  "EWALLET",
  "CASH",
]);

export const accountStatusEnum = pgEnum("account_status", [
  "ACTIVE",
  "ARCHIVED",
]);

export const accountIdSeq = pgSequence("account_id_seq");

export const accounts = pgTable(
  "account",
  {
    id: varchar("id", { length: 20 })
      .primaryKey()
      .default(sql`'ACC' || lpad(nextval('account_id_seq')::text, 3, '0')`),
    userId: varchar("user_id", { length: 20 })
      .notNull()
      .references(() => users.id),
    name: varchar("name", { length: 50 }).notNull(),
    type: accountTypeEnum("type").notNull(),
    institution: varchar("institution", { length: 50 }),
    initialBalance: bigint("initial_balance", { mode: "number" })
      .notNull()
      .default(0),
    last4: char("last4", { length: 4 }),
    color: varchar("color", { length: 9 }),
    includeInTotal: boolean("include_in_total").notNull().default(true),
    status: accountStatusEnum("status").notNull().default("ACTIVE"),
    createdAt: timestamp("timestamp", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("account_user_id_status_idx").on(t.userId, t.status),
    check("account_id_format", sql`${t.id} ~ '^ACC[0-9]{3,}$'`),
    check(
      "account_last4_format",
      sql`${t.last4} IS NULL OR ${t.last4} ~ '^[0-9]{4}$'`,
    ),
    check(
      "account_cash_no_institution",
      sql`${t.type} <> 'CASH' OR ${t.institution} IS NULL`,
    ),
    check(
      "account_initial_balance_range",
      sql`${t.initialBalance} BETWEEN -999999999999 AND 999999999999`,
    ),
    check(
      "account_color_format",
      sql`${t.color} IS NULL OR ${t.color} ~ '^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$'`,
    ),
  ],
);
