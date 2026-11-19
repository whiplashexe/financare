import { db } from "../../db/index.js";
import { oneTimePlans } from "../../db/schema/one.time.plans.js";
import {
  ACCOUNT_MESSAGE,
  ONE_TIME_MESSAGE,
} from "../../constants/response.message.js";
import { ApiError } from "../../utils/api.error.util.js";
import { findOwnedAccount } from "../../utils/account.util.js";
import { presentOneTime } from "../../utils/onetime.util.js";
import { userToday } from "../../utils/recurring.util.js";
import { CreateOneTimeInput } from "../../validations/onetime.validation.js";

export const createOneTime = async ({
  userId,
  input,
}: {
  userId: string;
  input: CreateOneTimeInput;
}) => {
  const today = await userToday(db, userId);
  if (input.date < today) {
    throw ApiError.businessRule(ONE_TIME_MESSAGE.DATE_IN_PAST);
  }

  if (input.source_account_id) {
    const account = await findOwnedAccount(userId, input.source_account_id);
    if (account.status === "ARCHIVED") {
      throw ApiError.businessRule(ACCOUNT_MESSAGE.ARCHIVED_NOT_ALLOWED);
    }
  }

  const [created] = await db
    .insert(oneTimePlans)
    .values({
      userId,
      sourceAccountId: input.source_account_id ?? null,
      name: input.name,
      date: input.date,
      targetAmount: input.target_amount,
      location: input.location ?? null,
      note: input.note ?? null,
      reminderOffsets: input.reminder_offsets,
    })
    .returning({ id: oneTimePlans.id });

  return presentOneTime(db, userId, created!.id);
};
