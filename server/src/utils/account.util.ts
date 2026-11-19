import { and, eq, or, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { accounts } from "../db/schema/accounts.js";
import { transactions } from "../db/schema/transactions.js";
import { ACCOUNT_MESSAGE } from "../constants/response.message.js";
import { ApiError } from "./api.error.util.js";

const movement = sql`
  coalesce((
    select sum(case
      when ${transactions.accountId} = ${accounts.id} and ${transactions.type} = 'INCOME' then ${transactions.amount}
      when ${transactions.accountId} = ${accounts.id} then -${transactions.amount}
      when ${transactions.toAccountId} = ${accounts.id} and ${transactions.type} = 'TRANSFER' then ${transactions.amount}
      else 0
    end)
    from ${transactions}
    where ${transactions.deletedAt} is null
      and (${transactions.accountId} = ${accounts.id} or ${transactions.toAccountId} = ${accounts.id})
  ), 0)
`;

export const accountColumns = {
  id: accounts.id,
  name: accounts.name,
  type: accounts.type,
  institution: accounts.institution,
  initialBalance: accounts.initialBalance,
  currentBalance: sql<number>`${accounts.initialBalance} + ${movement}`.mapWith(
    Number,
  ),
  last4: accounts.last4,
  color: accounts.color,
  icon: accounts.icon,
  includeInTotal: accounts.includeInTotal,
  status: accounts.status,
};

export type AccountRow = {
  id: string;
  name: string;
  type: "BANK" | "EWALLET" | "CASH";
  institution: string | null;
  initialBalance: number;
  currentBalance: number;
  last4: string | null;
  color: string | null;
  icon: string | null;
  includeInTotal: boolean;
  status: "ACTIVE" | "ARCHIVED";
};

export const toAccountResponse = (row: AccountRow) => ({
  id: row.id,
  name: row.name,
  type: row.type,
  institution: row.institution,
  initial_balance: row.initialBalance,
  current_balance: row.currentBalance,
  last4: row.last4,
  color: row.color,
  icon: row.icon,
  include_in_total: row.includeInTotal,
  status: row.status,
});

export type SelectExecutor = Pick<typeof db, "select">;

export const findOwnedAccount = async (
  userId: string,
  accountId: string,
  executor: SelectExecutor = db,
) => {
  const [row] = await executor
    .select(accountColumns)
    .from(accounts)
    .where(and(eq(accounts.id, accountId), eq(accounts.userId, userId)));

  if (!row) throw ApiError.notFound(ACCOUNT_MESSAGE.NOT_FOUND);
  return row;
};

export const hasTransactions = async (accountId: string) => {
  const [row] = await db
    .select({ id: transactions.id })
    .from(transactions)
    .where(
      or(
        eq(transactions.accountId, accountId),
        eq(transactions.toAccountId, accountId),
      ),
    )
    .limit(1);

  return Boolean(row);
};

export const accountBalance = async (
  executor: SelectExecutor,
  accountId: string,
) => {
  const [row] = await executor
    .select({ balance: accountColumns.currentBalance })
    .from(accounts)
    .where(eq(accounts.id, accountId));

  return row!.balance;
};

export const loadBalances = async (executor: SelectExecutor, userId: string) => {
  const rows = await executor
    .select({
      id: accounts.id,
      status: accounts.status,
      includeInTotal: accounts.includeInTotal,
      balance: accountColumns.currentBalance,
    })
    .from(accounts)
    .where(eq(accounts.userId, userId));

  return {
    byAccount: new Map(rows.map((row) => [row.id, row.balance])),
    total: rows
      .filter((row) => row.status === "ACTIVE" && row.includeInTotal)
      .reduce((sum, row) => sum + row.balance, 0),
  };
};
