import { sql } from "drizzle-orm";
import { oneTimePlans } from "../db/schema/one.time.plans.js";
import { recurringPlans } from "../db/schema/recurring.plans.js";
import { reminders } from "../db/schema/reminders.js";

export const reminderColumns = {
  id: reminders.id,
  recurringPlanId: reminders.recurringPlanId,
  oneTimePlanId: reminders.oneTimePlanId,
  dueDate: reminders.dueDate,
  scheduledAt: reminders.scheduledAt,
  sentAt: reminders.sentAt,
  channel: reminders.channel,
  status: reminders.status,
  name: sql<string>`coalesce(${recurringPlans.name}, ${oneTimePlans.name})`,
};

export type ReminderRow = {
  id: string;
  recurringPlanId: string | null;
  oneTimePlanId: string | null;
  dueDate: string;
  scheduledAt: Date;
  sentAt: Date | null;
  channel: "PUSH" | "EMAIL";
  status: "SCHEDULED" | "SENT" | "ACTED" | "SNOOZED" | "SKIPPED" | "FAILED";
  name: string;
};

export const toReminderResponse = (row: ReminderRow) => ({
  id: row.id,
  plan_type: row.recurringPlanId ? ("RECURRING" as const) : ("ONE_TIME" as const),
  plan_id: (row.recurringPlanId ?? row.oneTimePlanId)!,
  name: row.name,
  due_date: row.dueDate,
  scheduled_at: row.scheduledAt.toISOString(),
  sent_at: row.sentAt ? row.sentAt.toISOString() : null,
  channel: row.channel,
  status: row.status,
});
