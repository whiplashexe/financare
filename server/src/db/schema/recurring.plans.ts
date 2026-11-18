import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  pgEnum,
  pgSequence,
  pgTable,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { users } from "./users.js";
import { accounts } from "./accounts.js";
import { categories } from "./categories.js";
import { transactionTypeEnum } from "./enum.js";

export const recurringFrequencyEnum = pgEnum("recurring_frequency", [
  "DAILY",
  "WEEKLY",
  "MONTHLY",
  "YEARLY",
]);

export const recurringPlanStatusEnum = pgEnum("recurring_plan_status", [
  "ACTIVE",
  "PAUSED",
  "ENDED",
]);

export const recurringPlanIdSeq = pgSequence("recurring_plan_id_seq");

export const recurringPlans = pgTable(
  "recurring_plan",
  {
    id: varchar("id", { length: 20 })
      .primaryKey()
      .default(
        sql`prefixed_id('RPLAN', nextval('recurring_plan_id_seq'))`,
      ),
    userId: varchar("user_id", { length: 20 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accountId: varchar("account_id", { length: 20 })
      .notNull()
      .references(() => accounts.id, { onDelete: "restrict" }),
    categoryId: varchar("category_id", { length: 20 }).references(
      () => categories.id,
      { onDelete: "set null" },
    ),
    name: varchar("name", { length: 100 }).notNull(),
    type: transactionTypeEnum("type").notNull(),
    amount: bigint("amount", { mode: "number" }).notNull(),
    frequency: recurringFrequencyEnum("frequency").notNull(),
    startDate: date("start_date", { mode: "string" }).notNull(),
    endDate: date("end_date", { mode: "string" }),
    reminderOffsets: integer("reminder_offsets").array().notNull(),
    autoRecord: boolean("auto_record").notNull().default(false),
    nextDueDate: date("next_due_date", { mode: "string" }).notNull(),
    status: recurringPlanStatusEnum("status").notNull().default("ACTIVE"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    check("recurring_plan_id_format", sql`${t.id} ~ '^RPLAN[0-9]{3,}$'`),
    check("recurring_plan_type", sql`${t.type} IN ('INCOME', 'OUTCOME')`),
    check(
      "recurring_plan_amount_range",
      sql`${t.amount} > 0 AND ${t.amount} <= 999999999999`,
    ),
    check(
      "recurring_plan_end_after_start",
      sql`${t.endDate} IS NULL OR ${t.endDate} > ${t.startDate}`,
    ),
    check(
      "recurring_plan_reminder_offsets",
      sql`${t.reminderOffsets} <@ ARRAY[0,1,3,7] AND cardinality(${t.reminderOffsets}) BETWEEN 1 AND 4`,
    ),
    index("recurring_plan_status_next_due_idx").on(t.status, t.nextDueDate),
    index("recurring_plan_user_status_idx").on(t.userId, t.status),
  ],
);
