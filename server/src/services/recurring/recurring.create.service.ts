import { syncRecurringReminders } from "../../utils/reminder.util.js";
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
import { findOwnedPlan, userToday } from "../../utils/recurring.util.js";
import { CreatePlanInput } from "../../validations/recurring.validation.js";

export const createPlan = async ({
  userId,
  input,
}: {
  userId: string;
  input: CreatePlanInput;
}) => {
  const today = await userToday(db, userId);
  if (input.start_date < today) {
    throw ApiError.businessRule(PLAN_MESSAGE.START_IN_PAST);
  }

  const account = await findOwnedAccount(userId, input.account_id);
  if (account.status === "ARCHIVED") {
    throw ApiError.businessRule(ACCOUNT_MESSAGE.ARCHIVED_NOT_ALLOWED);
  }

  if (input.category_id) {
    const [category] = await db
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
      throw ApiError.badRequest(PLAN_MESSAGE.CATEGORY_TYPE_MISMATCH, {
        category_id: [PLAN_MESSAGE.CATEGORY_TYPE_MISMATCH],
      });
    }
  }

  const [created] = await db
    .insert(recurringPlans)
    .values({
      userId,
      accountId: input.account_id,
      categoryId: input.category_id ?? null,
      name: input.name,
      type: input.type,
      amount: input.amount,
      frequency: input.frequency,
      startDate: input.start_date,
      endDate: input.end_date ?? null,
      reminderOffsets: input.reminder_offsets,
      autoRecord: input.auto_record,
      nextDueDate: input.start_date,
    })
    .returning({ id: recurringPlans.id });

  await syncRecurringReminders(db, created!.id);

  return findOwnedPlan(db, userId, created!.id);
};
