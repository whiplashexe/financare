import { and, eq, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { categories } from "../db/schema/categories.js";
import { transactions } from "../db/schema/transactions.js";

type FeeExecutor = Pick<typeof db, "select" | "insert">;

export const feeName = (transferName: string) =>
  `Biaya admin: ${transferName}`.slice(0, 100);

export const insertAdminFee = async (
  executor: FeeExecutor,
  fee: {
    userId: string;
    accountId: string;
    parentId: string;
    transferName: string;
    amount: number;
    date: Date;
  },
) => {
  const [category] = await executor
    .select({ id: categories.id })
    .from(categories)
    .where(
      and(
        eq(categories.userId, fee.userId),
        eq(categories.type, "OUTCOME"),
        sql`lower(${categories.name}) = 'biaya admin'`,
      ),
    );

  await executor.insert(transactions).values({
    userId: fee.userId,
    accountId: fee.accountId,
    categoryId: category?.id ?? null,
    parentTransactionId: fee.parentId,
    type: "OUTCOME",
    name: feeName(fee.transferName),
    amount: fee.amount,
    date: fee.date,
    source: "MANUAL",
  });
};
