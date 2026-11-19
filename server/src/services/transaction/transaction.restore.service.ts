import { and, eq, isNotNull, or, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { transactions } from "../../db/schema/transactions.js";
import { TRANSACTION_MESSAGE } from "../../constants/response.message.js";
import { ApiError } from "../../utils/api.error.util.js";
import { loadTransactionDetail } from "../../utils/transaction.util.js";
import { withinRetention } from "./transaction.trash.service.js";

export const restoreTransaction = async ({
  userId,
  transactionId,
}: {
  userId: string;
  transactionId: string;
}) =>
  db.transaction(async (tx) => {
    const [row] = await tx
      .select({ parentTransactionId: transactions.parentTransactionId })
      .from(transactions)
      .where(
        and(
          eq(transactions.id, transactionId),
          eq(transactions.userId, userId),
          isNotNull(transactions.deletedAt),
          withinRetention,
        ),
      )
      .for("update");

    if (!row) throw ApiError.notFound(TRANSACTION_MESSAGE.NOT_FOUND);
    if (row.parentTransactionId) {
      throw ApiError.businessRule(TRANSACTION_MESSAGE.FEE_IS_LINKED);
    }

    await tx
      .update(transactions)
      .set({ deletedAt: sql`null` })
      .where(
        and(
          or(
            eq(transactions.id, transactionId),
            eq(transactions.parentTransactionId, transactionId),
          ),
          isNotNull(transactions.deletedAt),
        ),
      );

    return loadTransactionDetail(tx, userId, transactionId);
  });
