import {
  clearOneTimeReminders,
  resolveOneTimeReminders,
} from "../../utils/reminder.util.js";
import { and, eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { oneTimePlans } from "../../db/schema/one.time.plans.js";
import { ONE_TIME_MESSAGE } from "../../constants/response.message.js";
import { ApiError } from "../../utils/api.error.util.js";
import { findOwnedOneTime, presentOneTime } from "../../utils/onetime.util.js";
import { TransactionValidation } from "../../validations/transaction.validation.js";
import { CompleteOneTimeInput } from "../../validations/onetime.validation.js";
import { createInTx } from "../transaction/transaction.create.service.js";

const lockPlan = async (
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  userId: string,
  planId: string,
) => {
  await tx
    .select({ id: oneTimePlans.id })
    .from(oneTimePlans)
    .where(and(eq(oneTimePlans.id, planId), eq(oneTimePlans.userId, userId)))
    .for("update");

  return findOwnedOneTime(tx, userId, planId);
};

export const completeOneTime = async ({
  userId,
  planId,
  input,
}: {
  userId: string;
  planId: string;
  input: CompleteOneTimeInput;
}) =>
  db.transaction(async (tx) => {
    const plan = await lockPlan(tx, userId, planId);

    if (plan.status === "DONE") {
      throw ApiError.businessRule(ONE_TIME_MESSAGE.ALREADY_DONE);
    }
    if (plan.status === "CANCELLED") {
      throw ApiError.businessRule(ONE_TIME_MESSAGE.ALREADY_CANCELLED);
    }

    let recorded: Awaited<ReturnType<typeof createInTx>> | undefined;

    if (input.create_transaction) {
      const accountId = input.account_id ?? plan.sourceAccountId;
      if (!accountId) {
        throw ApiError.businessRule(ONE_TIME_MESSAGE.ACCOUNT_REQUIRED, {
          missing: ["account_id"],
        });
      }

      const parsed = TransactionValidation.CREATE.safeParse({
        type: "OUTCOME",
        name: plan.name,
        amount: input.amount ?? plan.targetAmount,
        date: input.date?.toISOString(),
        account_id: accountId,
        location: plan.location,
        note: plan.note,
        plan_id: plan.id,
      });
      if (!parsed.success) throw parsed.error;

      recorded = await createInTx(tx, userId, parsed.data);
    }

    await tx
      .update(oneTimePlans)
      .set({ status: "DONE" })
      .where(eq(oneTimePlans.id, planId));

    await clearOneTimeReminders(tx, planId);
    await resolveOneTimeReminders(tx, planId);

    return { plan: await presentOneTime(tx, userId, planId), ...recorded };
  });

export const cancelOneTime = async ({
  userId,
  planId,
}: {
  userId: string;
  planId: string;
}) =>
  db.transaction(async (tx) => {
    const plan = await lockPlan(tx, userId, planId);

    if (plan.status === "DONE") {
      throw ApiError.businessRule(ONE_TIME_MESSAGE.ALREADY_DONE);
    }

    if (plan.status !== "CANCELLED") {
      await tx
        .update(oneTimePlans)
        .set({ status: "CANCELLED" })
        .where(eq(oneTimePlans.id, planId));

      await clearOneTimeReminders(tx, planId);
      await resolveOneTimeReminders(tx, planId);
    }

    return presentOneTime(tx, userId, planId);
  });
