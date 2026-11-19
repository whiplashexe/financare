import { and, desc, eq, isNull, or, sql, type SQL } from "drizzle-orm";
import { db } from "../../db/index.js";
import { transactionItems } from "../../db/schema/transaction.items.js";
import { transactions } from "../../db/schema/transactions.js";
import { users } from "../../db/schema/users.js";
import { TRANSACTION_MESSAGE } from "../../constants/response.message.js";
import { ApiError } from "../../utils/api.error.util.js";
import { transactionSummaryColumns } from "../../utils/transaction.util.js";
import { ListTransactionsQuery } from "../../validations/transaction.validation.js";

type Bound = NonNullable<ListTransactionsQuery["from"]>;

const lowerBound = (bound: Bound, timezone: string): SQL =>
  bound.kind === "date"
    ? sql`${transactions.date} >= (${bound.value}::date)::timestamp at time zone ${timezone}`
    : sql`${transactions.date} >= ${bound.value.toISOString()}::timestamptz`;

const upperBound = (bound: Bound, timezone: string): SQL =>
  bound.kind === "date"
    ? sql`${transactions.date} < ((${bound.value}::date + 1)::timestamp at time zone ${timezone})`
    : sql`${transactions.date} <= ${bound.value.toISOString()}::timestamptz`;

const escapeLike = (value: string) => value.replace(/[\\%_]/g, (m) => `\\${m}`);

export const listTransactions = async ({
  userId,
  query,
}: {
  userId: string;
  query: ListTransactionsQuery;
}) => {
  const [owner] = await db
    .select({ timezone: users.timezone })
    .from(users)
    .where(eq(users.id, userId));
  const timezone = owner?.timezone ?? "Asia/Jakarta";

  if (query.cursor) {
    const [cursorRow] = await db
      .select({ id: transactions.id })
      .from(transactions)
      .where(
        and(eq(transactions.id, query.cursor), eq(transactions.userId, userId)),
      );
    if (!cursorRow) {
      throw ApiError.badRequest(TRANSACTION_MESSAGE.INVALID_CURSOR, {
        cursor: [TRANSACTION_MESSAGE.INVALID_CURSOR],
      });
    }
  }

  const pattern = query.q ? `%${escapeLike(query.q)}%` : undefined;

  const conditions = [
    eq(transactions.userId, userId),
    isNull(transactions.deletedAt),
    query.type ? eq(transactions.type, query.type) : undefined,
    query.account_id
      ? or(
          eq(transactions.accountId, query.account_id),
          eq(transactions.toAccountId, query.account_id),
        )
      : undefined,
    query.category_id ? eq(transactions.categoryId, query.category_id) : undefined,
    query.tag ? sql`${transactions.tags} @> array[${query.tag}]::text[]` : undefined,
    pattern
      ? sql`(
          ${transactions.name} ilike ${pattern}
          or ${transactions.note} ilike ${pattern}
          or exists (
            select 1 from ${transactionItems}
            where ${transactionItems.transactionId} = ${transactions.id}
              and ${transactionItems.name} ilike ${pattern}
          )
        )`
      : undefined,
    query.from ? lowerBound(query.from, timezone) : undefined,
    query.to ? upperBound(query.to, timezone) : undefined,
    query.cursor
      ? sql`(${transactions.date}, length(${transactions.id}), ${transactions.id}) < (
          select t.date, length(t.id), t.id from ${transactions} t where t.id = ${query.cursor}
        )`
      : undefined,
  ];

  const rows = await db
    .select(transactionSummaryColumns)
    .from(transactions)
    .where(and(...conditions))
    .orderBy(
      desc(transactions.date),
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
