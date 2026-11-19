import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  date,
  index,
  integer,
  pgEnum,
  pgSequence,
  pgTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { users } from "./users.js";
import { accounts } from "./accounts.js";

export const oneTimePlanStatusEnum = pgEnum("one_time_plan_status", [
  "PLANNED",
  "DONE",
  "MISSED",
  "CANCELLED",
]);

export const oneTimePlanIdSeq = pgSequence("one_time_plan_id_seq");

export const oneTimePlans = pgTable(
  "one_time_plan",
  {
    id: varchar("id", { length: 20 })
      .primaryKey()
      .default(
        sql`prefixed_id('OPLAN', nextval('one_time_plan_id_seq'))`,
      ),
    userId: varchar("user_id", { length: 20 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sourceAccountId: varchar("source_account_id", { length: 20 }).references(
      () => accounts.id,
      { onDelete: "set null" },
    ),
    name: varchar("name", { length: 100 }).notNull(),
    date: date("date", { mode: "string" }).notNull(),
    targetAmount: bigint("target_amount", { mode: "number" }).notNull(),
    location: varchar("location", { length: 255 }),
    note: text("note"),
    reminderOffsets: integer("reminder_offsets").array().notNull(),
    status: oneTimePlanStatusEnum("status").notNull().default("PLANNED"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    check("one_time_plan_id_format", sql`${t.id} ~ '^OPLAN[0-9]{3,}$'`),
    check(
      "one_time_plan_target_amount_range",
      sql`${t.targetAmount} > 0 AND ${t.targetAmount} <= 999999999999`,
    ),
    check(
      "one_time_plan_reminder_offsets",
      sql`${t.reminderOffsets} <@ ARRAY[1,3,7,14] AND cardinality(${t.reminderOffsets}) BETWEEN 1 AND 4`,
    ),
    index("one_time_plan_status_date_idx").on(t.status, t.date),
    index("one_time_plan_user_status_idx").on(t.userId, t.status),
  ],
);
