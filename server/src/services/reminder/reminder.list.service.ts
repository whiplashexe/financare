import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { oneTimePlans } from "../../db/schema/one.time.plans.js";
import { recurringPlans } from "../../db/schema/recurring.plans.js";
import { reminders } from "../../db/schema/reminders.js";
import { reminderColumns } from "../../utils/reminder.view.util.js";
import { ListRemindersQuery } from "../../validations/reminder.validation.js";

const LIMIT = 100;

export const listReminders = async ({
  userId,
  query,
}: {
  userId: string;
  query: ListRemindersQuery;
}) =>
  db
    .select(reminderColumns)
    .from(reminders)
    .leftJoin(recurringPlans, eq(recurringPlans.id, reminders.recurringPlanId))
    .leftJoin(oneTimePlans, eq(oneTimePlans.id, reminders.oneTimePlanId))
    .where(
      and(
        eq(reminders.userId, userId),
        query.status === "ALL"
          ? undefined
          : query.status === "pending"
            ? inArray(reminders.status, ["SENT", "SNOOZED"])
            : eq(reminders.status, query.status),
      ),
    )
    .orderBy(
      desc(reminders.scheduledAt),
      desc(sql`length(${reminders.id})`),
      desc(reminders.id),
    )
    .limit(LIMIT);
