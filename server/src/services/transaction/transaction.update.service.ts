import { and, count, eq, isNull } from "drizzle-orm";
import { db } from "../../db/index.js";
import { categories } from "../../db/schema/categories.js";
import { oneTimePlans } from "../../db/schema/one.time.plans.js";
import { recurringPlans } from "../../db/schema/recurring.plans.js";
import { transactionItems } from "../../db/schema/transaction.items.js";
import { transactions } from "../../db/schema/transactions.js";
import {
  ACCOUNT_MESSAGE,
  TRANSACTION_MESSAGE,
} from "../../constants/response.message.js";
import { ApiError } from "../../utils/api.error.util.js";
import { accountBalance, findOwnedAccount } from "../../utils/account.util.js";
import { feeName, insertAdminFee } from "../../utils/transaction.fee.util.js";
import { loadTransactionDetail } from "../../utils/transaction.util.js";
import { UpdateTransactionInput } from "../../validations/transaction.validation.js";

const CLOCK_SKEW_MS = 60_000;

const invalid = (field: string, message: string) =>
  ApiError.badRequest(message, { [field]: [message] });

export const updateTransaction = async ({
  userId,
  transactionId,
  input,
}: {
  userId: string;
  transactionId: string;
  input: UpdateTransactionInput;
}) =>
  db.transaction(async (tx) => {
    const [current] = await tx
      .select({
        id: transactions.id,
        type: transactions.type,
        name: transactions.name,
        accountId: transactions.accountId,
        toAccountId: transactions.toAccountId,
        categoryId: transactions.categoryId,
        date: transactions.date,
        parentTransactionId: transactions.parentTransactionId,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.id, transactionId),
          eq(transactions.userId, userId),
          isNull(transactions.deletedAt),
        ),
      )
      .for("update");

    if (!current) throw ApiError.notFound(TRANSACTION_MESSAGE.NOT_FOUND);
    if (current.parentTransactionId) {
      throw ApiError.businessRule(TRANSACTION_MESSAGE.FEE_IS_LINKED);
    }

    const [existingFee] = await tx
      .select({ id: transactions.id, amount: transactions.amount })
      .from(transactions)
      .where(
        and(
          eq(transactions.parentTransactionId, transactionId),
          isNull(transactions.deletedAt),
        ),
      )
      .for("update");

    const [itemCount] = await tx
      .select({ total: count() })
      .from(transactionItems)
      .where(eq(transactionItems.transactionId, transactionId));

    const finalType = input.type ?? current.type;
    const finalAccountId = input.account_id ?? current.accountId;
    const finalToAccountId =
      input.to_account_id !== undefined ? input.to_account_id : current.toAccountId;
    const finalCategoryId =
      input.category_id !== undefined ? input.category_id : current.categoryId;
    const finalName = input.name ?? current.name;
    const finalDate = input.date ?? current.date;
    const finalItemCount =
      input.items !== undefined ? input.items.length : itemCount!.total;

    if (finalType === "TRANSFER") {
      if (!finalToAccountId) {
        throw invalid("to_account_id", TRANSACTION_MESSAGE.TRANSFER_NEEDS_DESTINATION);
      }
      if (finalToAccountId === finalAccountId) {
        throw invalid("to_account_id", TRANSACTION_MESSAGE.TRANSFER_SAME_ACCOUNT);
      }
      if (finalCategoryId) {
        throw invalid("category_id", TRANSACTION_MESSAGE.TRANSFER_NO_CATEGORY);
      }
      if (finalItemCount > 0) {
        throw invalid("items", TRANSACTION_MESSAGE.TRANSFER_NO_ITEMS);
      }
    } else {
      if (finalToAccountId) {
        throw invalid("to_account_id", TRANSACTION_MESSAGE.NON_TRANSFER_DESTINATION);
      }
      if (input.admin_fee !== undefined) {
        throw invalid("admin_fee", TRANSACTION_MESSAGE.NON_TRANSFER_FEE);
      }
    }

    if (input.date && input.date.getTime() > Date.now() + CLOCK_SKEW_MS) {
      throw ApiError.businessRule(TRANSACTION_MESSAGE.FUTURE_DATE);
    }

    const accountChanges: string[] = [];
    if (input.account_id && input.account_id !== current.accountId) {
      accountChanges.push(input.account_id);
    }
    if (
      input.to_account_id &&
      input.to_account_id !== current.toAccountId
    ) {
      accountChanges.push(input.to_account_id);
    }
    for (const accountId of accountChanges) {
      const account = await findOwnedAccount(userId, accountId, tx);
      if (account.status === "ARCHIVED") {
        throw ApiError.businessRule(ACCOUNT_MESSAGE.ARCHIVED_NOT_ALLOWED);
      }
    }

    if (
      finalCategoryId &&
      (input.category_id !== undefined || input.type !== undefined)
    ) {
      const [category] = await tx
        .select({ type: categories.type })
        .from(categories)
        .where(
          and(eq(categories.id, finalCategoryId), eq(categories.userId, userId)),
        );
      if (!category) throw ApiError.notFound("Category not found");
      if (category.type !== finalType) {
        throw invalid("category_id", TRANSACTION_MESSAGE.CATEGORY_TYPE_MISMATCH);
      }
    }

    let planLinks: { recurringPlanId: string | null; oneTimePlanId: string | null } | undefined;
    if (input.plan_id !== undefined) {
      planLinks = { recurringPlanId: null, oneTimePlanId: null };
      if (input.plan_id) {
        const [recurring] = await tx
          .select({ id: recurringPlans.id })
          .from(recurringPlans)
          .where(
            and(
              eq(recurringPlans.id, input.plan_id),
              eq(recurringPlans.userId, userId),
            ),
          );
        if (recurring) {
          planLinks.recurringPlanId = recurring.id;
        } else {
          const [oneTime] = await tx
            .select({ id: oneTimePlans.id })
            .from(oneTimePlans)
            .where(
              and(
                eq(oneTimePlans.id, input.plan_id),
                eq(oneTimePlans.userId, userId),
              ),
            );
          if (!oneTime) {
            throw ApiError.notFound(TRANSACTION_MESSAGE.PLAN_NOT_FOUND);
          }
          planLinks.oneTimePlanId = oneTime.id;
        }
      }
    }

    const affected = [
      ...new Set(
        [
          current.accountId,
          current.toAccountId,
          finalAccountId,
          finalToAccountId,
        ].filter((id): id is string => Boolean(id)),
      ),
    ];

    const before: Record<string, number> = {};
    for (const accountId of affected) {
      before[accountId] = await accountBalance(tx, accountId);
    }

    await tx
      .update(transactions)
      .set({
        type: finalType,
        accountId: finalAccountId,
        toAccountId: finalType === "TRANSFER" ? finalToAccountId : null,
        categoryId: finalType === "TRANSFER" ? null : finalCategoryId,
        ...(input.name !== undefined && { name: input.name }),
        ...(input.amount !== undefined && { amount: input.amount }),
        ...(input.date !== undefined && { date: input.date }),
        ...(input.location !== undefined && { location: input.location }),
        ...(input.note !== undefined && { note: input.note }),
        ...(input.tags !== undefined && { tags: input.tags }),
        ...(planLinks && planLinks),
      })
      .where(eq(transactions.id, transactionId));

    const desiredFee =
      finalType === "TRANSFER"
        ? (input.admin_fee ?? existingFee?.amount ?? 0)
        : 0;

    if (desiredFee > 0 && existingFee) {
      await tx
        .update(transactions)
        .set({
          amount: desiredFee,
          accountId: finalAccountId,
          date: finalDate,
          name: feeName(finalName),
        })
        .where(eq(transactions.id, existingFee.id));
    } else if (desiredFee > 0) {
      await insertAdminFee(tx, {
        userId,
        accountId: finalAccountId,
        parentId: transactionId,
        transferName: finalName,
        amount: desiredFee,
        date: finalDate,
      });
    } else if (existingFee) {
      await tx.delete(transactions).where(eq(transactions.id, existingFee.id));
    }

    if (input.items !== undefined) {
      await tx
        .delete(transactionItems)
        .where(eq(transactionItems.transactionId, transactionId));
      if (input.items.length > 0) {
        await tx.insert(transactionItems).values(
          input.items.map((item, position) => ({
            transactionId,
            name: item.name,
            quantity: item.quantity,
            unit: item.unit ?? null,
            totalPrice: item.total_price,
            position,
          })),
        );
      }
    }

    const balancesAfter: Record<string, number> = {};
    const warnings: {
      code: "NEGATIVE_BALANCE";
      account_id: string;
      balance_after: number;
    }[] = [];
    for (const accountId of affected) {
      const after = await accountBalance(tx, accountId);
      balancesAfter[accountId] = after;
      if (after < 0 && after < before[accountId]!) {
        warnings.push({
          code: "NEGATIVE_BALANCE",
          account_id: accountId,
          balance_after: after,
        });
      }
    }

    return {
      transaction: await loadTransactionDetail(tx, userId, transactionId),
      balances_after: balancesAfter,
      warnings,
    };
  });
