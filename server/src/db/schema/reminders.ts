import { sql } from "drizzle-orm";
import {
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
import { recurringPlans } from "./recurring.plans.js";
import { oneTimePlans } from "./one.time.plans.js";

export const reminderChannelEnum = pgEnum("reminder_channel", [
  "PUSH",
  "EMAIL",
]);

export const reminderStatusEnum = pgEnum("reminder_status", [
  "SCHEDULED",
  "SENT",
  "ACTED",
  "SNOOZED",
  "SKIPPED",
  "FAILED",
]);

export const reminderIdSeq = pgSequence("reminder_id_seq");

export const reminders = pgTable(
  "reminder",
  {
    id: varchar("id", { length: 20 })
      .primaryKey()
      .default(sql`prefixed_id('RMD', nextval('reminder_id_seq'))`),
    userId: varchar("user_id", { length: 20 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    recurringPlanId: varchar("recurring_plan_id", { length: 20 }).references(
      () => recurringPlans.id,
      { onDelete: "cascade" },
    ),
    oneTimePlanId: varchar("one_time_plan_id", { length: 20 }).references(
      () => oneTimePlans.id,
      { onDelete: "cascade" },
    ),
    dueDate: date("due_date", { mode: "string" }).notNull(),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    channel: reminderChannelEnum("channel").notNull().default("PUSH"),
    status: reminderStatusEnum("status").notNull().default("SCHEDULED"),
    attempts: integer("attempts").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    check("reminder_id_format", sql`${t.id} ~ '^RMD[0-9]{3,}$'`),
    check(
      "reminder_exactly_one_plan",
      sql`(${t.recurringPlanId} IS NOT NULL) <> (${t.oneTimePlanId} IS NOT NULL)`,
    ),
    check("reminder_attempts_range", sql`${t.attempts} BETWEEN 0 AND 5`),
    index("reminder_status_scheduled_idx").on(t.status, t.scheduledAt),
    index("reminder_user_status_idx").on(t.userId, t.status),
    index("reminder_recurring_plan_idx")
      .on(t.recurringPlanId)
      .where(sql`${t.recurringPlanId} IS NOT NULL`),
    index("reminder_one_time_plan_idx")
      .on(t.oneTimePlanId)
      .where(sql`${t.oneTimePlanId} IS NOT NULL`),
  ],
);
