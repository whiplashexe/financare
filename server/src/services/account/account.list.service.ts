import { asc, eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { accounts } from "../../db/schema/accounts.js";
import { accountColumns } from "../../utils/account.util.js";
import { ListAccountsQuery } from "../../validations/account.validation.js";

export const listAccounts = async ({
  userId,
  query,
}: {
  userId: string;
  query: ListAccountsQuery;
}) => {
  const rows = await db
    .select(accountColumns)
    .from(accounts)
    .where(eq(accounts.userId, userId))
    .orderBy(asc(accounts.createdAt), asc(accounts.id));

  const totalBalance = rows
    .filter((row) => row.status === "ACTIVE" && row.includeInTotal)
    .reduce((sum, row) => sum + row.currentBalance, 0);

  return {
    totalBalance,
    accounts: rows.filter(
      (row) => query.status === "ALL" || row.status === query.status,
    ),
  };
};
