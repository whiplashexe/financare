import { and, eq, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { categories } from "../../db/schema/categories.js";
import { oneTimePlans } from "../../db/schema/one.time.plans.js";
import { recurringPlans } from "../../db/schema/recurring.plans.js";
import { transactionImages } from "../../db/schema/transaction.images.js";
import { transactionItems } from "../../db/schema/transaction.items.js";
import { transactionTemplates } from "../../db/schema/transaction.templates.js";
import { transactions } from "../../db/schema/transactions.js";
import {
  ACCOUNT_MESSAGE,
  TRANSACTION_MESSAGE,
} from "../../constants/response.message.js";
import { ApiError } from "../../utils/api.error.util.js";
import { accountBalance, findOwnedAccount } from "../../utils/account.util.js";
import { insertAdminFee } from "../../utils/transaction.fee.util.js";
import { verifyImages, type VerifiedImage } from "../../utils/image.util.js";
import {
  findStoredResponse,
  storeResponse,
  type DbTx,
} from "../../utils/idempotency.util.js";
import { loadTransactionDetail } from "../../utils/transaction.util.js";
import { CreateTransactionInput } from "../../validations/transaction.validation.js";

const CLOCK_SKEW_MS = 60_000;
const IDEMPOTENCY_ROUTE = "POST /transactions";

type Warning = { code: "NEGATIVE_BALANCE"; account_id: string; balance_after: number };

export const createInTx = async (
  tx: DbTx,
  userId: string,
  input: CreateTransactionInput,
  options: { source?: "MANUAL" | "AUTO"; images?: VerifiedImage[] } = {},
) => {
  if (input.date && input.date.getTime() > Date.now() + CLOCK_SKEW_MS) {
    throw ApiError.businessRule(TRANSACTION_MESSAGE.FUTURE_DATE);
  }

  const source = await findOwnedAccount(userId, input.account_id, tx);
  if (source.status === "ARCHIVED") {
    throw ApiError.businessRule(ACCOUNT_MESSAGE.ARCHIVED_NOT_ALLOWED);
  }

  const destinationId = input.type === "TRANSFER" ? input.to_account_id! : null;
  if (destinationId) {
    const destination = await findOwnedAccount(userId, destinationId, tx);
    if (destination.status === "ARCHIVED") {
      throw ApiError.businessRule(ACCOUNT_MESSAGE.ARCHIVED_NOT_ALLOWED);
    }
  }

  if (input.category_id) {
    const [category] = await tx
      .select({ type: categories.type })
      .from(categories)
      .where(
        and(
          eq(categories.id, input.category_id),
          eq(categories.userId, userId),
        ),
      );
    if (!category) throw ApiError.notFound("Category not found");
    if (category.type !== input.type) {
      throw ApiError.badRequest(TRANSACTION_MESSAGE.CATEGORY_TYPE_MISMATCH, {
        category_id: [TRANSACTION_MESSAGE.CATEGORY_TYPE_MISMATCH],
      });
    }
  }

  let recurringPlanId: string | null = null;
  let oneTimePlanId: string | null = null;
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
      recurringPlanId = recurring.id;
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
      if (!oneTime) throw ApiError.notFound(TRANSACTION_MESSAGE.PLAN_NOT_FOUND);
      oneTimePlanId = oneTime.id;
    }
  }

  if (input.template_id) {
    const used = await tx
      .update(transactionTemplates)
      .set({
        useCount: sql`${transactionTemplates.useCount} + 1`,
        lastUsedAt: sql`now()`,
      })
      .where(
        and(
          eq(transactionTemplates.id, input.template_id),
          eq(transactionTemplates.userId, userId),
        ),
      )
      .returning({ id: transactionTemplates.id });
    if (used.length === 0) {
      throw ApiError.notFound(TRANSACTION_MESSAGE.TEMPLATE_NOT_FOUND);
    }
  }

  const [created] = await tx
    .insert(transactions)
    .values({
      userId,
      accountId: input.account_id,
      toAccountId: destinationId,
      categoryId: input.category_id ?? null,
      recurringPlanId,
      oneTimePlanId,
      type: input.type,
      name: input.name,
      amount: input.amount,
      ...(input.date && { date: input.date }),
      location: input.location ?? null,
      note: input.note ?? null,
      tags: input.tags ?? [],
      source: options.source ?? "MANUAL",
    })
    .returning({ id: transactions.id, date: transactions.date });

  if (input.type === "TRANSFER" && input.admin_fee) {
    await insertAdminFee(tx, {
      userId,
      accountId: input.account_id,
      parentId: created!.id,
      transferName: input.name,
      amount: input.admin_fee,
      date: created!.date,
    });
  }

  if (input.items && input.items.length > 0) {
    await tx.insert(transactionItems).values(
      input.items.map((item, position) => ({
        transactionId: created!.id,
        name: item.name,
        quantity: item.quantity,
        unit: item.unit ?? null,
        totalPrice: item.total_price,
        position,
      })),
    );
  }

  if (options.images && options.images.length > 0) {
    await tx.insert(transactionImages).values(
      options.images.map((image, position) => ({
        transactionId: created!.id,
        publicId: image.publicId,
        mimeType: image.mimeType,
        size: image.size,
        position,
      })),
    );
  }

  const warnings: Warning[] = [];
  const sourceAfter = await accountBalance(tx, input.account_id);
  if (input.type !== "INCOME" && sourceAfter < 0) {
    warnings.push({
      code: "NEGATIVE_BALANCE",
      account_id: input.account_id,
      balance_after: sourceAfter,
    });
  }

  const transaction = await loadTransactionDetail(tx, userId, created!.id);

  const data = {
    transaction,
    ...(destinationId
      ? {
          balances_after: {
            [input.account_id]: sourceAfter,
            [destinationId]: await accountBalance(tx, destinationId),
          },
        }
      : { account_balance_after: sourceAfter }),
    warnings,
  };

  return data;
};

export const createTransaction = async ({
  userId,
  input,
  idempotencyKey,
}: {
  userId: string;
  input: CreateTransactionInput;
  idempotencyKey?: string | undefined;
}) => {
  const images = await verifyImages(userId, input.images ?? []);

  return db.transaction(async (tx) => {
    if (idempotencyKey) {
      const stored = await findStoredResponse(
        tx,
        userId,
        idempotencyKey,
        IDEMPOTENCY_ROUTE,
      );
      if (stored) return { replayed: true as const, data: stored };
    }

    const data = await createInTx(tx, userId, input, { images });

    if (idempotencyKey) {
      await storeResponse(tx, userId, idempotencyKey, IDEMPOTENCY_ROUTE, data);
    }

    return { replayed: false as const, data };
  });
};
