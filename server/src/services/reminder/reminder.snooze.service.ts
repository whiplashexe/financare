import { and, eq, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { oneTimePlans } from "../../db/schema/one.time.plans.js";
import { recurringPlans } from "../../db/schema/recurring.plans.js";
import { reminders } from "../../db/schema/reminders.js";
import { REMINDER_MESSAGE } from "../../constants/response.message.js";
import { ApiError } from "../../utils/api.error.util.js";
import { reminderColumns } from "../../utils/reminder.view.util.js";
import { SnoozeInput } from "../../validations/reminder.validation.js";

export const snoozeReminder = async ({
  userId,
  reminderId,
  input,
}: {
  userId: string;
  reminderId: string;
  input: SnoozeInput;
}) =>
  db.transaction(async (tx) => {
    const [current] = await tx
      .select({ status: reminders.status })
      .from(reminders)
      .where(and(eq(reminders.id, reminderId), eq(reminders.userId, userId)))
      .for("update");

    if (!current) throw ApiError.notFound(REMINDER_MESSAGE.NOT_FOUND);
    if (["ACTED", "SKIPPED", "FAILED"].includes(current.status)) {
      throw ApiError.businessRule(REMINDER_MESSAGE.NOT_SNOOZABLE);
    }

    await tx
      .update(reminders)
      .set({
        status: "SNOOZED",
        scheduledAt: sql`now() + ${input.minutes} * interval '1 minute'`,
        sentAt: null,
        attempts: 0,
      })
      .where(eq(reminders.id, reminderId));

    const [row] = await tx
      .select(reminderColumns)
      .from(reminders)
      .leftJoin(recurringPlans, eq(recurringPlans.id, reminders.recurringPlanId))
      .leftJoin(oneTimePlans, eq(oneTimePlans.id, reminders.oneTimePlanId))
      .where(eq(reminders.id, reminderId));

    return row!;
  });
