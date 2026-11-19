import { and, asc, count, eq, isNull, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { transactionImages } from "../../db/schema/transaction.images.js";
import { transactions } from "../../db/schema/transactions.js";
import {
  IMAGE_MESSAGE,
  TRANSACTION_MESSAGE,
} from "../../constants/response.message.js";
import {
  cloudinaryClient,
  MAX_IMAGES_PER_TRANSACTION,
} from "../../lib/cloudinary.js";
import { ApiError } from "../../utils/api.error.util.js";
import {
  loadImages,
  toImageResponse,
  verifyImages,
} from "../../utils/image.util.js";
import type { DbTx } from "../../utils/idempotency.util.js";
import type {
  ImageInput,
  ReorderImagesInput,
} from "../../validations/transaction.validation.js";

const lockOwnedTransaction = async (
  tx: DbTx,
  userId: string,
  transactionId: string,
) => {
  const [row] = await tx
    .select({ parentTransactionId: transactions.parentTransactionId })
    .from(transactions)
    .where(
      and(
        eq(transactions.id, transactionId),
        eq(transactions.userId, userId),
        isNull(transactions.deletedAt),
      ),
    )
    .for("update");

  if (!row) throw ApiError.notFound(TRANSACTION_MESSAGE.NOT_FOUND);
  if (row.parentTransactionId) {
    throw ApiError.businessRule(TRANSACTION_MESSAGE.FEE_IS_LINKED);
  }
};

export const addImage = async ({
  userId,
  transactionId,
  input,
}: {
  userId: string;
  transactionId: string;
  input: ImageInput;
}) => {
  const [verified] = await verifyImages(userId, [input]);

  return db.transaction(async (tx) => {
    await lockOwnedTransaction(tx, userId, transactionId);

    const [existing] = await tx
      .select({ total: count() })
      .from(transactionImages)
      .where(eq(transactionImages.transactionId, transactionId));

    if (existing!.total >= MAX_IMAGES_PER_TRANSACTION) {
      throw ApiError.businessRule(IMAGE_MESSAGE.LIMIT);
    }

    const [used] = await tx
      .select({ id: transactionImages.id })
      .from(transactionImages)
      .where(eq(transactionImages.publicId, verified!.publicId));
    if (used) throw ApiError.conflict(IMAGE_MESSAGE.ALREADY_USED);

    const [created] = await tx
      .insert(transactionImages)
      .values({
        transactionId,
        publicId: verified!.publicId,
        mimeType: verified!.mimeType,
        size: verified!.size,
        position: existing!.total,
      })
      .returning({
        id: transactionImages.id,
        publicId: transactionImages.publicId,
        mimeType: transactionImages.mimeType,
      });

    return toImageResponse(created!);
  });
};

export const removeImage = async ({
  userId,
  transactionId,
  imageId,
}: {
  userId: string;
  transactionId: string;
  imageId: string;
}) => {
  const publicId = await db.transaction(async (tx) => {
    await lockOwnedTransaction(tx, userId, transactionId);

    const [image] = await tx
      .select({ id: transactionImages.id, publicId: transactionImages.publicId })
      .from(transactionImages)
      .where(
        and(
          eq(transactionImages.id, imageId),
          eq(transactionImages.transactionId, transactionId),
        ),
      );
    if (!image) throw ApiError.notFound(IMAGE_MESSAGE.NOT_FOUND);

    await tx.delete(transactionImages).where(eq(transactionImages.id, imageId));

    await tx.execute(sql`
      update transaction_image t set position = r.rn - 1
      from (
        select id, row_number() over (order by position) as rn
        from transaction_image where transaction_id = ${transactionId}
      ) r
      where t.id = r.id and t.position <> r.rn - 1
    `);

    return image.publicId;
  });

  await cloudinaryClient.remove([publicId]);
};

export const reorderImages = async ({
  userId,
  transactionId,
  input,
}: {
  userId: string;
  transactionId: string;
  input: ReorderImagesInput;
}) =>
  db.transaction(async (tx) => {
    await lockOwnedTransaction(tx, userId, transactionId);

    const current = await tx
      .select({ id: transactionImages.id })
      .from(transactionImages)
      .where(eq(transactionImages.transactionId, transactionId))
      .orderBy(asc(transactionImages.position));

    const known = new Set(current.map((row) => row.id));
    const matches =
      input.ids.length === current.length && input.ids.every((id) => known.has(id));
    if (!matches) {
      throw ApiError.badRequest(IMAGE_MESSAGE.ORDER_MISMATCH, {
        ids: [IMAGE_MESSAGE.ORDER_MISMATCH],
      });
    }

    for (const [position, id] of input.ids.entries()) {
      await tx
        .update(transactionImages)
        .set({ position })
        .where(eq(transactionImages.id, id));
    }

    return loadImages(tx, transactionId);
  });
