import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { transactions } from "../../db/schema/transactions.js";
import { presentOneTime } from "../../utils/onetime.util.js";
import { transactionSummaryColumns } from "../../utils/transaction.util.js";

const HISTORY_LIMIT = 50;

export const getOneTime = async ({
  userId,
  planId,
}: {
  userId: string;
  planId: string;
}) => {
  const plan = await presentOneTime(db, userId, planId);

  const history = await db
    .select(transactionSummaryColumns)
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        eq(transactions.oneTimePlanId, planId),
        isNull(transactions.deletedAt),
      ),
    )
    .orderBy(
      desc(transactions.date),
      desc(sql`length(${transactions.id})`),
      desc(transactions.id),
    )
    .limit(HISTORY_LIMIT);

  return { plan, history };
};
