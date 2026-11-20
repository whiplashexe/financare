import { and, asc, desc, eq, isNull, sql, type SQL } from "drizzle-orm";
import { db } from "../../db/index.js";
import { accounts } from "../../db/schema/accounts.js";
import { categories } from "../../db/schema/categories.js";
import { transactions } from "../../db/schema/transactions.js";
import { users } from "../../db/schema/users.js";
import { findOwnedAccount } from "../../utils/account.util.js";
import {
  lowerBound,
  upperBound,
  type RangeBound,
} from "../../utils/date.range.util.js";
import {
  FlowQuery,
  RangeQuery,
  TrendQuery,
} from "../../validations/report.validation.js";

const timezoneOf = async (userId: string) => {
  const [row] = await db
    .select({ timezone: users.timezone })
    .from(users)
    .where(eq(users.id, userId));
  return row?.timezone ?? "Asia/Jakarta";
};

const monthStart = (timezone: string) =>
  sql`(date_trunc('month', now() at time zone ${timezone}))::timestamp at time zone ${timezone}`;
const nextMonthStart = (timezone: string) =>
  sql`(date_trunc('month', now() at time zone ${timezone}) + interval '1 month')::timestamp at time zone ${timezone}`;

const rangeConditions = (
  from: RangeBound | undefined,
  to: RangeBound | undefined,
  timezone: string,
): SQL[] => {
  if (!from && !to) {
    return [
      sql`${transactions.date} >= ${monthStart(timezone)}`,
      sql`${transactions.date} < ${nextMonthStart(timezone)}`,
    ];
  }
  return [
    ...(from ? [lowerBound(transactions.date, from, timezone)] : []),
    ...(to ? [upperBound(transactions.date, to, timezone)] : []),
  ];
};

export const outcomeByCategory = async ({
  userId,
  query,
}: {
  userId: string;
  query: RangeQuery;
}) => {
  const timezone = await timezoneOf(userId);
  const total = sql<number>`sum(${transactions.amount})::bigint`.mapWith(Number);

  const rows = await db
    .select({
      categoryId: transactions.categoryId,
      name: categories.name,
      total,
    })
    .from(transactions)
    .leftJoin(categories, eq(categories.id, transactions.categoryId))
    .where(
      and(
        eq(transactions.userId, userId),
        isNull(transactions.deletedAt),
        eq(transactions.type, "OUTCOME"),
        ...rangeConditions(query.from, query.to, timezone),
      ),
    )
    .groupBy(transactions.categoryId, categories.name)
    .orderBy(desc(total), asc(categories.name));

  const grand = rows.reduce((sum, row) => sum + row.total, 0);

  return rows.map((row) => ({
    category_id: row.categoryId,
    name: row.name ?? "Uncategorized",
    total: row.total,
    percent: grand === 0 ? 0 : Math.round((row.total / grand) * 1000) / 10,
  }));
};

export const monthlyTrend = async ({
  userId,
  query,
}: {
  userId: string;
  query: TrendQuery;
}) => {
  const timezone = await timezoneOf(userId);
  const back = query.months - 1;

  const result = await db.execute<{
    month: string;
    income: string;
    outcome: string;
  }>(sql`
    with months as (
      select generate_series(
        date_trunc('month', now() at time zone ${timezone}) - (${back}::int * interval '1 month'),
        date_trunc('month', now() at time zone ${timezone}),
        interval '1 month'
      ) as m
    )
    select
      to_char(m, 'YYYY-MM') as month,
      coalesce((
        select sum(${transactions.amount}) from ${transactions}
        where ${transactions.userId} = ${userId}
          and ${transactions.deletedAt} is null
          and ${transactions.type} = 'INCOME'
          and ${transactions.date} >= m::timestamp at time zone ${timezone}
          and ${transactions.date} < (m + interval '1 month')::timestamp at time zone ${timezone}
      ), 0)::bigint as income,
      coalesce((
        select sum(${transactions.amount}) from ${transactions}
        where ${transactions.userId} = ${userId}
          and ${transactions.deletedAt} is null
          and ${transactions.type} = 'OUTCOME'
          and ${transactions.date} >= m::timestamp at time zone ${timezone}
          and ${transactions.date} < (m + interval '1 month')::timestamp at time zone ${timezone}
      ), 0)::bigint as outcome
    from months
    order by m
  `);

  return result.rows.map((row) => ({
    month: row.month,
    income: Number(row.income),
    outcome: Number(row.outcome),
  }));
};

export const accountFlow = async ({
  userId,
  query,
}: {
  userId: string;
  query: FlowQuery;
}) => {
  if (query.account_id) await findOwnedAccount(userId, query.account_id);

  const timezone = await timezoneOf(userId);
  const range = rangeConditions(query.from, query.to, timezone);
  const rangeSql = sql.join(
    range.map((condition) => sql`and ${condition}`),
    sql` `,
  );

  const result = await db.execute<{
    account_id: string;
    name: string;
    income: string;
    outcome: string;
    transfer_in: string;
    transfer_out: string;
  }>(sql`
    select
      ${accounts.id} as account_id,
      ${accounts.name} as name,
      coalesce(sum(${transactions.amount}) filter (
        where ${transactions.type} = 'INCOME' and ${transactions.accountId} = ${accounts.id}
      ), 0)::bigint as income,
      coalesce(sum(${transactions.amount}) filter (
        where ${transactions.type} = 'OUTCOME' and ${transactions.accountId} = ${accounts.id}
      ), 0)::bigint as outcome,
      coalesce(sum(${transactions.amount}) filter (
        where ${transactions.type} = 'TRANSFER' and ${transactions.toAccountId} = ${accounts.id}
      ), 0)::bigint as transfer_in,
      coalesce(sum(${transactions.amount}) filter (
        where ${transactions.type} = 'TRANSFER' and ${transactions.accountId} = ${accounts.id}
      ), 0)::bigint as transfer_out
    from ${accounts}
    left join ${transactions}
      on (${transactions.accountId} = ${accounts.id} or ${transactions.toAccountId} = ${accounts.id})
      and ${transactions.userId} = ${accounts.userId}
      and ${transactions.deletedAt} is null
      ${rangeSql}
    where ${accounts.userId} = ${userId}
      ${query.account_id ? sql`and ${accounts.id} = ${query.account_id}` : sql``}
    group by ${accounts.id}, ${accounts.name}, ${accounts.status}, ${accounts.createdAt}
    having ${accounts.status} = 'ACTIVE' or count(${transactions.id}) > 0
    order by ${accounts.createdAt}, length(${accounts.id}), ${accounts.id}
  `);

  return result.rows.map((row) => ({
    account_id: row.account_id,
    name: row.name,
    income: Number(row.income),
    outcome: Number(row.outcome),
    transfer_in: Number(row.transfer_in),
    transfer_out: Number(row.transfer_out),
  }));
};
