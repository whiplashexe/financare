import { and, eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { oneTimePlans } from "../../db/schema/one.time.plans.js";
import {
  ACCOUNT_MESSAGE,
  ONE_TIME_MESSAGE,
} from "../../constants/response.message.js";
import { ApiError } from "../../utils/api.error.util.js";
import { findOwnedAccount } from "../../utils/account.util.js";
import { findOwnedOneTime, presentOneTime } from "../../utils/onetime.util.js";
import { userToday } from "../../utils/recurring.util.js";
import { UpdateOneTimeInput } from "../../validations/onetime.validation.js";

export const updateOneTime = async ({
  userId,
  planId,
  input,
}: {
  userId: string;
  planId: string;
  input: UpdateOneTimeInput;
}) =>
  db.transaction(async (tx) => {
    await tx
      .select({ id: oneTimePlans.id })
      .from(oneTimePlans)
      .where(and(eq(oneTimePlans.id, planId), eq(oneTimePlans.userId, userId)))
      .for("update");

    const current = await findOwnedOneTime(tx, userId, planId);
    if (current.status === "DONE" || current.status === "CANCELLED") {
      throw ApiError.businessRule(ONE_TIME_MESSAGE.NOT_EDITABLE);
    }

    if (input.date !== undefined) {
      const today = await userToday(tx, userId);
      const moved = input.date !== current.date;
      if (input.date < today && (moved || current.status === "MISSED")) {
        throw ApiError.businessRule(ONE_TIME_MESSAGE.DATE_IN_PAST);
      }
    }

    if (
      input.source_account_id &&
      input.source_account_id !== current.sourceAccountId
    ) {
      const account = await findOwnedAccount(userId, input.source_account_id, tx);
      if (account.status === "ARCHIVED") {
        throw ApiError.businessRule(ACCOUNT_MESSAGE.ARCHIVED_NOT_ALLOWED);
      }
    }

    await tx
      .update(oneTimePlans)
      .set({
        status:
          current.status === "MISSED" && input.date !== undefined
            ? "PLANNED"
            : current.status,
        ...(input.name !== undefined && { name: input.name }),
        ...(input.date !== undefined && { date: input.date }),
        ...(input.target_amount !== undefined && {
          targetAmount: input.target_amount,
        }),
        ...(input.source_account_id !== undefined && {
          sourceAccountId: input.source_account_id,
        }),
        ...(input.location !== undefined && { location: input.location }),
        ...(input.note !== undefined && { note: input.note }),
        ...(input.reminder_offsets !== undefined && {
          reminderOffsets: input.reminder_offsets,
        }),
      })
      .where(eq(oneTimePlans.id, planId));

    return presentOneTime(tx, userId, planId);
  });
