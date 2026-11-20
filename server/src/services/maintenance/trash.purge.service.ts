import { and, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { transactionImages } from "../../db/schema/transaction.images.js";
import { transactions } from "../../db/schema/transactions.js";
import { cloudinaryClient } from "../../lib/cloudinary.js";
import { TRASH_RETENTION_DAYS } from "../../utils/transaction.util.js";

const CHUNK = 500;

export const purgeTrash = async () => {
  const expired = await db
    .select({ id: transactions.id })
    .from(transactions)
    .where(
      and(
        isNotNull(transactions.deletedAt),
        isNull(transactions.parentTransactionId),
        sql`${transactions.deletedAt} <= now() - ${TRASH_RETENTION_DAYS} * interval '1 day'`,
      ),
    );

  let purged = 0;
  const publicIds: string[] = [];

  for (let start = 0; start < expired.length; start += CHUNK) {
    const ids = expired.slice(start, start + CHUNK).map((row) => row.id);

    await db.transaction(async (tx) => {
      const images = await tx
        .select({ publicId: transactionImages.publicId })
        .from(transactionImages)
        .where(inArray(transactionImages.transactionId, ids));
      publicIds.push(...images.map((image) => image.publicId));

      await tx.delete(transactions).where(inArray(transactions.id, ids));
    });

    purged += ids.length;
  }

  await cloudinaryClient.remove(publicIds);

  return { purged, images: publicIds.length };
};
