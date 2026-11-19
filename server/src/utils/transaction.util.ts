import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { transactionImages } from "../db/schema/transaction.images.js";
import { transactionItems } from "../db/schema/transaction.items.js";
import { transactions } from "../db/schema/transactions.js";
import { TRANSACTION_MESSAGE } from "../constants/response.message.js";
import { cloudinaryClient } from "../lib/cloudinary.js";
import { ApiError } from "./api.error.util.js";
import { loadImages } from "./image.util.js";

export const TRASH_RETENTION_DAYS = 30;

export type SelectExecutor = Pick<typeof db, "select">;

export const transactionColumns = {
  id: transactions.id,
  type: transactions.type,
  name: transactions.name,
  amount: transactions.amount,
  date: transactions.date,
  accountId: transactions.accountId,
  toAccountId: transactions.toAccountId,
  categoryId: transactions.categoryId,
  parentTransactionId: transactions.parentTransactionId,
  recurringPlanId: transactions.recurringPlanId,
  oneTimePlanId: transactions.oneTimePlanId,
  location: transactions.location,
  note: transactions.note,
  tags: transactions.tags,
  source: transactions.source,
};

export const transactionSummaryColumns = {
  ...transactionColumns,
  imagesCount: sql<number>`(
    select count(*) from ${transactionImages}
    where ${transactionImages.transactionId} = ${transactions.id}
  )`.mapWith(Number),
  itemsCount: sql<number>`(
    select count(*) from ${transactionItems}
    where ${transactionItems.transactionId} = ${transactions.id}
  )`.mapWith(Number),
  thumbnailPublicId: sql<string | null>`(
    select ${transactionImages.publicId} from ${transactionImages}
    where ${transactionImages.transactionId} = ${transactions.id}
    order by ${transactionImages.position}
    limit 1
  )`,
};

export type TransactionRow = {
  id: string;
  type: "INCOME" | "OUTCOME" | "TRANSFER";
  name: string;
  amount: number;
  date: Date;
  accountId: string;
  toAccountId: string | null;
  categoryId: string | null;
  parentTransactionId: string | null;
  recurringPlanId: string | null;
  oneTimePlanId: string | null;
  location: string | null;
  note: string | null;
  tags: string[];
  source: "MANUAL" | "AUTO";
};

type ItemRow = {
  name: string;
  quantity: number | null;
  unit: string | null;
  totalPrice: number;
};

export const toTransactionResponse = (
  row: TransactionRow,
  items: ItemRow[],
  adminFee: number | null,
  images: { id: string; url: string }[],
) => ({
  id: row.id,
  type: row.type,
  name: row.name,
  amount: row.amount,
  date: row.date.toISOString(),
  account_id: row.accountId,
  to_account_id: row.toAccountId,
  admin_fee: adminFee,
  category_id: row.categoryId,
  parent_transaction_id: row.parentTransactionId,
  plan_id: row.recurringPlanId ?? row.oneTimePlanId ?? null,
  location: row.location,
  note: row.note,
  tags: row.tags,
  source: row.source,
  items: items.map((item) => ({
    name: item.name,
    quantity: item.quantity ?? 1,
    unit: item.unit,
    total_price: item.totalPrice,
  })),
  items_total: items.reduce((sum, item) => sum + item.totalPrice, 0),
  images,
});

export const toTransactionSummary = (
  row: TransactionRow & {
    imagesCount: number;
    itemsCount: number;
    thumbnailPublicId: string | null;
  },
) => ({
  id: row.id,
  type: row.type,
  name: row.name,
  amount: row.amount,
  date: row.date.toISOString(),
  account_id: row.accountId,
  to_account_id: row.toAccountId,
  category_id: row.categoryId,
  parent_transaction_id: row.parentTransactionId,
  tags: row.tags,
  source: row.source,
  images_count: row.imagesCount,
  items_count: row.itemsCount,
  thumbnail_url: row.thumbnailPublicId
    ? cloudinaryClient.thumbnailUrl(row.thumbnailPublicId)
    : null,
});

export const loadTransactionDetail = async (
  executor: SelectExecutor,
  userId: string,
  transactionId: string,
) => {
  const [row] = await executor
    .select(transactionColumns)
    .from(transactions)
    .where(
      and(
        eq(transactions.id, transactionId),
        eq(transactions.userId, userId),
        isNull(transactions.deletedAt),
      ),
    );

  if (!row) throw ApiError.notFound(TRANSACTION_MESSAGE.NOT_FOUND);

  const items = await executor
    .select({
      name: transactionItems.name,
      quantity: transactionItems.quantity,
      unit: transactionItems.unit,
      totalPrice: transactionItems.totalPrice,
    })
    .from(transactionItems)
    .where(eq(transactionItems.transactionId, transactionId))
    .orderBy(asc(transactionItems.position));

  let adminFee: number | null = null;
  if (row.type === "TRANSFER") {
    const [fee] = await executor
      .select({
        total: sql<number>`coalesce(sum(${transactions.amount}), 0)`.mapWith(
          Number,
        ),
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.parentTransactionId, transactionId),
          isNull(transactions.deletedAt),
        ),
      );
    adminFee = fee!.total;
  }

  const images = await loadImages(executor, transactionId);

  return toTransactionResponse(row, items, adminFee, images);
};

export const toTrashSummary = (
  row: TransactionRow & {
    imagesCount: number;
    itemsCount: number;
    thumbnailPublicId: string | null;
    deletedAt: Date;
  },
) => ({
  ...toTransactionSummary(row),
  deleted_at: row.deletedAt.toISOString(),
  permanent_delete_at: new Date(
    row.deletedAt.getTime() + TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString(),
});
