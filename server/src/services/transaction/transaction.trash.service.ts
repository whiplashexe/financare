import { and, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { transactions } from "../../db/schema/transactions.js";
import { TRANSACTION_MESSAGE } from "../../constants/response.message.js";
import { ApiError } from "../../utils/api.error.util.js";
import {
  TRASH_RETENTION_DAYS,
  transactionSummaryColumns,
} from "../../utils/transaction.util.js";
import { TrashQuery } from "../../validations/transaction.validation.js";

export const withinRetention = sql`${transactions.deletedAt} > now() - ${TRASH_RETENTION_DAYS} * interval '1 day'`;

export const listTrash = async ({
  userId,
  query,
}: {
  userId: string;
  query: TrashQuery;
}) => {
  if (query.cursor) {
    const [cursorRow] = await db
      .select({ id: transactions.id })
      .from(transactions)
      .where(
        and(
          eq(transactions.id, query.cursor),
          eq(transactions.userId, userId),
          isNotNull(transactions.deletedAt),
        ),
      );
    if (!cursorRow) {
      throw ApiError.badRequest(TRANSACTION_MESSAGE.INVALID_CURSOR, {
        cursor: [TRANSACTION_MESSAGE.INVALID_CURSOR],
      });
    }
  }

  const rows = await db
    .select({
      ...transactionSummaryColumns,
      deletedAt: sql<Date>`${transactions.deletedAt}`.mapWith(
        (value) => new Date(value),
      ),
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        isNotNull(transactions.deletedAt),
        isNull(transactions.parentTransactionId),
        withinRetention,
        query.cursor
          ? sql`(${transactions.deletedAt}, length(${transactions.id}), ${transactions.id}) < (
              select t.deleted_at, length(t.id), t.id from ${transactions} t where t.id = ${query.cursor}
            )`
          : undefined,
      ),
    )
    .orderBy(
      desc(transactions.deletedAt),
      desc(sql`length(${transactions.id})`),
      desc(transactions.id),
    )
    .limit(query.limit + 1);

  const hasMore = rows.length > query.limit;
  const page = hasMore ? rows.slice(0, query.limit) : rows;

  return {
    rows: page,
    nextCursor: hasMore ? page[page.length - 1]!.id : null,
  };
};
