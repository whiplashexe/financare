import { and, eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { recurringPlans } from "../../db/schema/recurring.plans.js";
import { findOwnedPlan } from "../../utils/recurring.util.js";

export const deletePlan = async ({
  userId,
  planId,
}: {
  userId: string;
  planId: string;
}) => {
  await findOwnedPlan(db, userId, planId);

  await db
    .delete(recurringPlans)
    .where(and(eq(recurringPlans.id, planId), eq(recurringPlans.userId, userId)));
};
