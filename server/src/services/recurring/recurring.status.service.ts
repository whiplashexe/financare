import {
  clearRecurringReminders,
  syncRecurringReminders,
} from "../../utils/reminder.util.js";
import { and, eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { recurringPlans } from "../../db/schema/recurring.plans.js";
import { PLAN_MESSAGE } from "../../constants/response.message.js";
import { ApiError } from "../../utils/api.error.util.js";
import { nextDueOnOrAfter } from "../../utils/recurrence.util.js";
import { findOwnedPlan, userToday } from "../../utils/recurring.util.js";

const lockPlan = async (
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  userId: string,
  planId: string,
) => {
  await tx
    .select({ id: recurringPlans.id })
    .from(recurringPlans)
    .where(and(eq(recurringPlans.id, planId), eq(recurringPlans.userId, userId)))
    .for("update");

  const plan = await findOwnedPlan(tx, userId, planId);
  if (plan.status === "ENDED") {
    throw ApiError.businessRule(PLAN_MESSAGE.PLAN_ENDED);
  }
  return plan;
};

export const pausePlan = async ({
  userId,
  planId,
}: {
  userId: string;
  planId: string;
}) =>
  db.transaction(async (tx) => {
    await lockPlan(tx, userId, planId);

    await tx
      .update(recurringPlans)
      .set({ status: "PAUSED" })
      .where(eq(recurringPlans.id, planId));

    await clearRecurringReminders(tx, planId);

    return findOwnedPlan(tx, userId, planId);
  });

export const resumePlan = async ({
  userId,
  planId,
}: {
  userId: string;
  planId: string;
}) =>
  db.transaction(async (tx) => {
    const plan = await lockPlan(tx, userId, planId);
    if (plan.status === "ACTIVE") return plan;

    const today = await userToday(tx, userId);
    const nextDueDate =
      plan.nextDueDate >= today
        ? plan.nextDueDate
        : nextDueOnOrAfter(plan.startDate, plan.frequency, today);
    const ended = plan.endDate !== null && nextDueDate > plan.endDate;

    await tx
      .update(recurringPlans)
      .set({
        status: ended ? "ENDED" : "ACTIVE",
        nextDueDate: ended ? plan.nextDueDate : nextDueDate,
      })
      .where(eq(recurringPlans.id, planId));

    await syncRecurringReminders(tx, planId);

    return findOwnedPlan(tx, userId, planId);
  });
