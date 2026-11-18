import { and, eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { accounts } from "../../db/schema/accounts.js";
import { recurringPlans } from "../../db/schema/recurring.plans.js";
import { ACCOUNT_MESSAGE } from "../../constants/response.message.js";
import { ApiError } from "../../utils/api.error.util.js";
import { findOwnedAccount, hasTransactions } from "../../utils/account.util.js";

export const deleteAccount = async ({
  userId,
  accountId,
}: {
  userId: string;
  accountId: string;
}) => {
  await findOwnedAccount(userId, accountId);

  if (await hasTransactions(accountId)) {
    throw ApiError.businessRule(ACCOUNT_MESSAGE.HAS_TRANSACTIONS);
  }

  const [plan] = await db
    .select({ id: recurringPlans.id })
    .from(recurringPlans)
    .where(eq(recurringPlans.accountId, accountId))
    .limit(1);

  if (plan) throw ApiError.businessRule(ACCOUNT_MESSAGE.HAS_RECURRING_PLANS);

  await db
    .delete(accounts)
    .where(and(eq(accounts.id, accountId), eq(accounts.userId, userId)));
};
