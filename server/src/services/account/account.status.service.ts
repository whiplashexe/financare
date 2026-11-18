import { and, eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { accounts } from "../../db/schema/accounts.js";
import { transactionTemplates } from "../../db/schema/transaction.templates.js";
import { findOwnedAccount } from "../../utils/account.util.js";

export const archiveAccount = async ({
  userId,
  accountId,
}: {
  userId: string;
  accountId: string;
}) => {
  await findOwnedAccount(userId, accountId);

  await db.transaction(async (tx) => {
    await tx
      .update(accounts)
      .set({ status: "ARCHIVED" })
      .where(and(eq(accounts.id, accountId), eq(accounts.userId, userId)));

    await tx
      .update(transactionTemplates)
      .set({ accountId: null })
      .where(
        and(
          eq(transactionTemplates.userId, userId),
          eq(transactionTemplates.accountId, accountId),
        ),
      );

    await tx
      .update(transactionTemplates)
      .set({ toAccountId: null })
      .where(
        and(
          eq(transactionTemplates.userId, userId),
          eq(transactionTemplates.toAccountId, accountId),
        ),
      );
  });

  return findOwnedAccount(userId, accountId);
};

export const unarchiveAccount = async ({
  userId,
  accountId,
}: {
  userId: string;
  accountId: string;
}) => {
  await findOwnedAccount(userId, accountId);

  await db
    .update(accounts)
    .set({ status: "ACTIVE" })
    .where(and(eq(accounts.id, accountId), eq(accounts.userId, userId)));

  return findOwnedAccount(userId, accountId);
};
