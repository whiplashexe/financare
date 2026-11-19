import { and, eq, isNull, or, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { transactionImages } from "../../db/schema/transaction.images.js";
import { transactions } from "../../db/schema/transactions.js";
import { cloudinaryClient } from "../../lib/cloudinary.js";
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
}) => {
  const publicIds = await db.transaction(async (tx) => {
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
      const images = await tx
        .select({ publicId: transactionImages.publicId })
        .from(transactionImages)
        .where(eq(transactionImages.transactionId, transactionId));

      await tx.delete(transactions).where(eq(transactions.id, transactionId));
      return images.map((image) => image.publicId);
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

    return [] as string[];
  });

  await cloudinaryClient.remove(publicIds);
};
