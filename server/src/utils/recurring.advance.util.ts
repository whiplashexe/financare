import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { recurringPlans } from "../db/schema/recurring.plans.js";
import { nextDueAfter, type Frequency } from "./recurrence.util.js";

type AdvanceExecutor = Pick<typeof db, "update">;

export const advancePlan = async (
  executor: AdvanceExecutor,
  plan: {
    id: string;
    startDate: string;
    frequency: Frequency;
    endDate: string | null;
  },
  resolvedDueDate: string,
) => {
  const next = nextDueAfter(plan.startDate, plan.frequency, resolvedDueDate);
  const ended = plan.endDate !== null && next > plan.endDate;

  await executor
    .update(recurringPlans)
    .set({
      nextDueDate: ended ? resolvedDueDate : next,
      status: ended ? "ENDED" : "ACTIVE",
    })
    .where(eq(recurringPlans.id, plan.id));

  return ended ? null : next;
};
