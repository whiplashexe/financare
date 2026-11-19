import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { planOccurrences } from "../../db/schema/plan.occurrences.js";
import { transactions } from "../../db/schema/transactions.js";
import { findOwnedPlan } from "../../utils/recurring.util.js";
import { transactionSummaryColumns } from "../../utils/transaction.util.js";

const HISTORY_LIMIT = 50;

export const getPlan = async ({
  userId,
  planId,
}: {
  userId: string;
  planId: string;
}) => {
  const plan = await findOwnedPlan(db, userId, planId);

  const history = await db
    .select(transactionSummaryColumns)
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        eq(transactions.recurringPlanId, planId),
        isNull(transactions.deletedAt),
      ),
    )
    .orderBy(
      desc(transactions.date),
      desc(sql`length(${transactions.id})`),
      desc(transactions.id),
    )
    .limit(HISTORY_LIMIT);

  const occurrences = await db
    .select({
      dueDate: planOccurrences.dueDate,
      outcome: planOccurrences.outcome,
      transactionId: planOccurrences.transactionId,
      resolvedAt: planOccurrences.resolvedAt,
    })
    .from(planOccurrences)
    .where(eq(planOccurrences.recurringPlanId, planId))
    .orderBy(desc(planOccurrences.dueDate))
    .limit(HISTORY_LIMIT);

  return { plan, history, occurrences };
};
