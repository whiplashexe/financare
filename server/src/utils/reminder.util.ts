import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { oneTimePlans } from "../db/schema/one.time.plans.js";
import { recurringPlans } from "../db/schema/recurring.plans.js";
import { reminders } from "../db/schema/reminders.js";
import { users } from "../db/schema/users.js";

export type ReminderExecutor = Pick<
  typeof db,
  "execute" | "delete" | "update" | "select"
>;

const UNSENT = ["SCHEDULED"] as const;
const OPEN = ["SCHEDULED", "SENT", "SNOOZED"] as const;

export const clearRecurringReminders = async (
  executor: ReminderExecutor,
  planId: string,
) => {
  await executor
    .delete(reminders)
    .where(
      and(
        eq(reminders.recurringPlanId, planId),
        inArray(reminders.status, [...UNSENT]),
        isNull(reminders.sentAt),
      ),
    );
};

export const clearOneTimeReminders = async (
  executor: ReminderExecutor,
  planId: string,
) => {
  await executor
    .delete(reminders)
    .where(
      and(
        eq(reminders.oneTimePlanId, planId),
        inArray(reminders.status, [...UNSENT]),
        isNull(reminders.sentAt),
      ),
    );
};

export const syncRecurringReminders = async (
  executor: ReminderExecutor,
  planId: string,
) => {
  await clearRecurringReminders(executor, planId);

  await executor.execute(sql`
    insert into reminder (user_id, recurring_plan_id, due_date, scheduled_at)
    select p.user_id, p.id, p.next_due_date,
           ((p.next_due_date - o.days) + u.notif_send_time)::timestamp at time zone u.timezone
    from recurring_plan p
    join "user" u on u.id = p.user_id
    cross join lateral unnest(p.reminder_offsets) as o(days)
    where p.id = ${planId}
      and p.status = 'ACTIVE'
      and u.deleted_at is null
      and ((p.next_due_date - o.days) + u.notif_send_time)::timestamp at time zone u.timezone > now()
  `);
};

export const syncOneTimeReminders = async (
  executor: ReminderExecutor,
  planId: string,
) => {
  await clearOneTimeReminders(executor, planId);

  await executor.execute(sql`
    insert into reminder (user_id, one_time_plan_id, due_date, scheduled_at)
    select p.user_id, p.id, p.date,
           ((p.date - o.days) + u.notif_send_time)::timestamp at time zone u.timezone
    from one_time_plan p
    join "user" u on u.id = p.user_id
    cross join lateral unnest(p.reminder_offsets) as o(days)
    where p.id = ${planId}
      and p.status = 'PLANNED'
      and u.deleted_at is null
      and ((p.date - o.days) + u.notif_send_time)::timestamp at time zone u.timezone > now()
  `);
};

export const resolveRecurringReminders = async (
  executor: ReminderExecutor,
  planId: string,
  dueDate: string,
) => {
  await executor
    .update(reminders)
    .set({ status: "ACTED" })
    .where(
      and(
        eq(reminders.recurringPlanId, planId),
        eq(reminders.dueDate, dueDate),
        inArray(reminders.status, [...OPEN]),
      ),
    );
};

export const resolveOneTimeReminders = async (
  executor: ReminderExecutor,
  planId: string,
) => {
  await executor
    .update(reminders)
    .set({ status: "ACTED" })
    .where(
      and(
        eq(reminders.oneTimePlanId, planId),
        inArray(reminders.status, [...OPEN]),
      ),
    );
};

export const scheduleMissedFollowUp = async (
  executor: ReminderExecutor,
  planId: string,
) => {
  await executor.execute(sql`
    insert into reminder (user_id, one_time_plan_id, due_date, scheduled_at)
    select p.user_id, p.id, p.date, now()
    from one_time_plan p
    where p.id = ${planId} and p.status = 'MISSED'
  `);
};

export const rescheduleUserReminders = async (
  executor: ReminderExecutor,
  userId: string,
) => {
  const recurring = await executor
    .select({ id: recurringPlans.id })
    .from(recurringPlans)
    .where(and(eq(recurringPlans.userId, userId), eq(recurringPlans.status, "ACTIVE")));

  const oneTime = await executor
    .select({ id: oneTimePlans.id })
    .from(oneTimePlans)
    .where(and(eq(oneTimePlans.userId, userId), eq(oneTimePlans.status, "PLANNED")));

  for (const plan of recurring) await syncRecurringReminders(executor, plan.id);
  for (const plan of oneTime) await syncOneTimeReminders(executor, plan.id);
};

export const userExists = async (executor: ReminderExecutor, userId: string) => {
  const [row] = await executor
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, userId), isNull(users.deletedAt)));
  return Boolean(row);
};
