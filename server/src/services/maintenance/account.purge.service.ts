import { eq, isNotNull } from "drizzle-orm";
import { db } from "../../db/index.js";
import { accounts } from "../../db/schema/accounts.js";
import { recurringPlans } from "../../db/schema/recurring.plans.js";
import { transactions } from "../../db/schema/transactions.js";
import { users } from "../../db/schema/users.js";
import { cloudinaryClient, imageFolder } from "../../lib/cloudinary.js";

export const purgeDeletedAccounts = async () => {
  const doomed = await db
    .select({ id: users.id })
    .from(users)
    .where(isNotNull(users.deletedAt));

  const purged: string[] = [];
  const failed: string[] = [];

  for (const user of doomed) {
    try {
      await db.transaction(async (tx) => {
        await tx.delete(transactions).where(eq(transactions.userId, user.id));
        await tx.delete(recurringPlans).where(eq(recurringPlans.userId, user.id));
        await tx.delete(accounts).where(eq(accounts.userId, user.id));
        await tx.delete(users).where(eq(users.id, user.id));
      });
      await cloudinaryClient.removeByPrefix(`${imageFolder(user.id)}/`);
      purged.push(user.id);
    } catch {
      failed.push(user.id);
    }
  }

  return { purged: purged.length, failed: failed.length, userIds: purged };
};
