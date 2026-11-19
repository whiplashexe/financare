import { and, eq, isNull, or, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { transactions } from "../../db/schema/transactions.js";
import { TRANSACTION_MESSAGE } from "../../constants/response.message.js";
import { ApiError } from "../../utils/api.error.util.js";

export const deleteTransaction = async ({
  userId,
  transactionId,
  permanent,
}: {
  userId: string;
  transactionId: string;
  permanent: boolean;
}) =>
  db.transaction(async (tx) => {
    const [row] = await tx
      .select({
        parentTransactionId: transactions.parentTransactionId,
        deletedAt: transactions.deletedAt,
      })
      .from(transactions)
      .where(
        and(eq(transactions.id, transactionId), eq(transactions.userId, userId)),
      )
      .for("update");

    if (!row) throw ApiError.notFound(TRANSACTION_MESSAGE.NOT_FOUND);
    if (row.parentTransactionId) {
      throw ApiError.businessRule(TRANSACTION_MESSAGE.FEE_IS_LINKED);
    }

    if (permanent) {
      await tx.delete(transactions).where(eq(transactions.id, transactionId));
      return;
    }

    if (row.deletedAt) throw ApiError.notFound(TRANSACTION_MESSAGE.NOT_FOUND);

    await tx
      .update(transactions)
      .set({ deletedAt: sql`now()` })
      .where(
        and(
          or(
            eq(transactions.id, transactionId),
            eq(transactions.parentTransactionId, transactionId),
          ),
          isNull(transactions.deletedAt),
        ),
      );
  });
