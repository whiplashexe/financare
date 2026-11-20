import {
  resolveRecurringReminders,
  syncRecurringReminders,
} from "../../utils/reminder.util.js";
import { and, eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { planOccurrences } from "../../db/schema/plan.occurrences.js";
import { recurringPlans } from "../../db/schema/recurring.plans.js";
import { PLAN_MESSAGE } from "../../constants/response.message.js";
import { ApiError } from "../../utils/api.error.util.js";
import {
  findStoredResponse,
  storeResponse,
  type DbTx,
} from "../../utils/idempotency.util.js";
import { advancePlan } from "../../utils/recurring.advance.util.js";
import { findOwnedPlan } from "../../utils/recurring.util.js";
import { loadTransactionDetail } from "../../utils/transaction.util.js";
import { TransactionValidation } from "../../validations/transaction.validation.js";
import { ConfirmOccurrenceInput } from "../../validations/recurring.validation.js";
import { createInTx } from "../transaction/transaction.create.service.js";

const loadForResolution = async (
  tx: DbTx,
  userId: string,
  planId: string,
  dueDate: string,
) => {
  await tx
    .select({ id: recurringPlans.id })
    .from(recurringPlans)
    .where(and(eq(recurringPlans.id, planId), eq(recurringPlans.userId, userId)))
    .for("update");

  const plan = await findOwnedPlan(tx, userId, planId);

  const [existing] = await tx
    .select({
      outcome: planOccurrences.outcome,
      transactionId: planOccurrences.transactionId,
    })
    .from(planOccurrences)
    .where(
      and(
        eq(planOccurrences.recurringPlanId, planId),
        eq(planOccurrences.dueDate, dueDate),
      ),
    );

  if (existing) {
    const transaction = existing.transactionId
      ? await loadTransactionDetail(tx, userId, existing.transactionId).catch(
          () => null,
        )
      : null;
    throw ApiError.conflict(PLAN_MESSAGE.ALREADY_RESOLVED, {
      outcome: existing.outcome,
      transaction,
    });
  }

  if (plan.status !== "ACTIVE") {
    throw ApiError.businessRule(PLAN_MESSAGE.NOT_ACTIVE);
  }
  if (dueDate !== plan.nextDueDate) {
    throw ApiError.businessRule(PLAN_MESSAGE.NOT_A_DUE_DATE);
  }

  return plan;
};

export const confirmOccurrence = async ({
  userId,
  planId,
  dueDate,
  input,
  idempotencyKey,
}: {
  userId: string;
  planId: string;
  dueDate: string;
  input: ConfirmOccurrenceInput;
  idempotencyKey?: string | undefined;
}) =>
  db.transaction(async (tx) => {
    const route = `POST /recurring-plans/${planId}/occurrences/${dueDate}/confirm`;

    if (idempotencyKey) {
      const stored = await findStoredResponse(tx, userId, idempotencyKey, route);
      if (stored) return { replayed: true as const, data: stored };
    }

    const plan = await loadForResolution(tx, userId, planId, dueDate);

    const parsed = TransactionValidation.CREATE.safeParse({
      type: plan.type,
      name: plan.name,
      amount: input.amount ?? plan.amount,
      date: input.date?.toISOString(),
      account_id: input.account_id ?? plan.accountId,
      category_id: plan.categoryId,
      plan_id: plan.id,
    });
    if (!parsed.success) throw parsed.error;

    const created = await createInTx(tx, userId, parsed.data);

    await tx.insert(planOccurrences).values({
      recurringPlanId: planId,
      dueDate,
      outcome: "CONFIRMED",
      transactionId: created.transaction.id,
    });

    const nextDueDate = await advancePlan(tx, plan, dueDate);
    await resolveRecurringReminders(tx, planId, dueDate);
    await syncRecurringReminders(tx, planId);
    const data = { ...created, next_due_date: nextDueDate };

    if (idempotencyKey) {
      await storeResponse(tx, userId, idempotencyKey, route, data);
    }

    return { replayed: false as const, data };
  });

export const skipOccurrence = async ({
  userId,
  planId,
  dueDate,
}: {
  userId: string;
  planId: string;
  dueDate: string;
}) =>
  db.transaction(async (tx) => {
    const plan = await loadForResolution(tx, userId, planId, dueDate);

    await tx.insert(planOccurrences).values({
      recurringPlanId: planId,
      dueDate,
      outcome: "SKIPPED",
      transactionId: null,
    });

    const nextDueDate = await advancePlan(tx, plan, dueDate);
    await resolveRecurringReminders(tx, planId, dueDate);
    await syncRecurringReminders(tx, planId);

    return { next_due_date: nextDueDate };
  });
