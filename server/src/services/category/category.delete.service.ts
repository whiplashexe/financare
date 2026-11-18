import { and, count, eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { categories } from "../../db/schema/categories.js";
import { recurringPlans } from "../../db/schema/recurring.plans.js";
import { transactionTemplates } from "../../db/schema/transaction.templates.js";
import { transactions } from "../../db/schema/transactions.js";
import { CATEGORY_MESSAGE } from "../../constants/response.message.js";
import { ApiError } from "../../utils/api.error.util.js";

export const deleteCategory = async ({
  userId,
  categoryId,
  confirm,
}: {
  userId: string;
  categoryId: string;
  confirm: boolean;
}) => {
  const outcome = await db.transaction(async (tx) => {
    const [category] = await tx
      .select({
        id: categories.id,
        type: categories.type,
        isFallback: categories.isFallback,
      })
      .from(categories)
      .where(and(eq(categories.id, categoryId), eq(categories.userId, userId)))
      .for("update");

    if (!category) return { kind: "not_found" } as const;
    if (category.isFallback) return { kind: "protected" } as const;

    const [fallback] = await tx
      .select({ id: categories.id })
      .from(categories)
      .where(
        and(
          eq(categories.userId, userId),
          eq(categories.type, category.type),
          eq(categories.isFallback, true),
        ),
      );

    if (!fallback) throw new Error(`fallback category missing for ${userId}`);

    const [affected] = await tx
      .select({ total: count() })
      .from(transactions)
      .where(eq(transactions.categoryId, categoryId));

    const movedTransactions = affected!.total;

    if (movedTransactions > 0 && !confirm) {
      return { kind: "confirm", affected: movedTransactions } as const;
    }

    await tx
      .update(transactions)
      .set({ categoryId: fallback.id })
      .where(eq(transactions.categoryId, categoryId));

    await tx
      .update(transactionTemplates)
      .set({ categoryId: fallback.id })
      .where(eq(transactionTemplates.categoryId, categoryId));

    await tx
      .update(recurringPlans)
      .set({ categoryId: fallback.id })
      .where(eq(recurringPlans.categoryId, categoryId));

    await tx.delete(categories).where(eq(categories.id, categoryId));

    return { kind: "deleted", movedTransactions } as const;
  });

  if (outcome.kind === "not_found") {
    throw ApiError.notFound(CATEGORY_MESSAGE.NOT_FOUND);
  }
  if (outcome.kind === "protected") {
    throw ApiError.businessRule(CATEGORY_MESSAGE.FALLBACK_PROTECTED);
  }
  if (outcome.kind === "confirm") {
    throw ApiError.confirmationRequired(CATEGORY_MESSAGE.CONFIRM_DELETE, {
      affected_transactions: outcome.affected,
    });
  }

  return { movedTransactions: outcome.movedTransactions };
};
