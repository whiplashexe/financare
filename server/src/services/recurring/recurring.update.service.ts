import { and, eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { categories } from "../../db/schema/categories.js";
import { recurringPlans } from "../../db/schema/recurring.plans.js";
import {
  ACCOUNT_MESSAGE,
  PLAN_MESSAGE,
} from "../../constants/response.message.js";
import { ApiError } from "../../utils/api.error.util.js";
import { findOwnedAccount } from "../../utils/account.util.js";
import { findOwnedPlan } from "../../utils/recurring.util.js";
import { UpdatePlanInput } from "../../validations/recurring.validation.js";

export const updatePlan = async ({
  userId,
  planId,
  input,
}: {
  userId: string;
  planId: string;
  input: UpdatePlanInput;
}) =>
  db.transaction(async (tx) => {
    await tx
      .select({ id: recurringPlans.id })
      .from(recurringPlans)
      .where(and(eq(recurringPlans.id, planId), eq(recurringPlans.userId, userId)))
      .for("update");

    const current = await findOwnedPlan(tx, userId, planId);
    if (current.status === "ENDED") {
      throw ApiError.businessRule(PLAN_MESSAGE.PLAN_ENDED);
    }

    const finalType = input.type ?? current.type;
    const finalCategoryId =
      input.category_id !== undefined ? input.category_id : current.categoryId;

    if (input.account_id && input.account_id !== current.accountId) {
      const account = await findOwnedAccount(userId, input.account_id, tx);
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
        throw ApiError.badRequest(PLAN_MESSAGE.CATEGORY_TYPE_MISMATCH, {
          category_id: [PLAN_MESSAGE.CATEGORY_TYPE_MISMATCH],
        });
      }
    }

    const finalEndDate =
      input.end_date !== undefined ? input.end_date : current.endDate;
    const frequencyChanged =
      input.frequency !== undefined && input.frequency !== current.frequency;
    const reanchor =
      frequencyChanged && (finalEndDate === null || finalEndDate > current.nextDueDate);
    const finalStartDate = reanchor ? current.nextDueDate : current.startDate;

    if (finalEndDate !== null && finalEndDate <= finalStartDate) {
      throw ApiError.badRequest(PLAN_MESSAGE.END_BEFORE_START, {
        end_date: [PLAN_MESSAGE.END_BEFORE_START],
      });
    }

    const ended = finalEndDate !== null && finalEndDate < current.nextDueDate;

    await tx
      .update(recurringPlans)
      .set({
        startDate: finalStartDate,
        status: ended ? "ENDED" : current.status,
        ...(input.name !== undefined && { name: input.name }),
        ...(input.type !== undefined && { type: input.type }),
        ...(input.amount !== undefined && { amount: input.amount }),
        ...(input.account_id !== undefined && { accountId: input.account_id }),
        ...(input.category_id !== undefined && { categoryId: input.category_id }),
        ...(input.frequency !== undefined && { frequency: input.frequency }),
        ...(input.end_date !== undefined && { endDate: input.end_date }),
        ...(input.reminder_offsets !== undefined && {
          reminderOffsets: input.reminder_offsets,
        }),
        ...(input.auto_record !== undefined && { autoRecord: input.auto_record }),
      })
      .where(eq(recurringPlans.id, planId));

    return findOwnedPlan(tx, userId, planId);
  });
