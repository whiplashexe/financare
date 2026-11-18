import { and, eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { accounts } from "../../db/schema/accounts.js";
import { ACCOUNT_MESSAGE } from "../../constants/response.message.js";
import { ApiError } from "../../utils/api.error.util.js";
import { findOwnedAccount, hasTransactions } from "../../utils/account.util.js";
import { UpdateAccountInput } from "../../validations/account.validation.js";

export const updateAccount = async ({
  userId,
  accountId,
  input,
}: {
  userId: string;
  accountId: string;
  input: UpdateAccountInput;
}) => {
  const current = await findOwnedAccount(userId, accountId);

  const nextType = input.type ?? current.type;
  const nextInstitution =
    input.institution !== undefined ? input.institution : current.institution;

  if (nextType === "CASH" && nextInstitution) {
    throw ApiError.badRequest(ACCOUNT_MESSAGE.CASH_NO_INSTITUTION, {
      institution: [ACCOUNT_MESSAGE.CASH_NO_INSTITUTION],
    });
  }

  const balanceChanges =
    input.initial_balance !== undefined &&
    input.initial_balance !== current.initialBalance;

  if (balanceChanges && !input.confirm && (await hasTransactions(accountId))) {
    throw ApiError.confirmationRequired(ACCOUNT_MESSAGE.CONFIRM_INITIAL_BALANCE, {
      preview: {
        old_balance: current.currentBalance,
        new_balance:
          current.currentBalance + (input.initial_balance! - current.initialBalance),
      },
    });
  }

  await db
    .update(accounts)
    .set({
      ...(input.name !== undefined && { name: input.name }),
      ...(input.type !== undefined && { type: input.type }),
      ...(input.institution !== undefined && { institution: input.institution }),
      ...(input.initial_balance !== undefined && {
        initialBalance: input.initial_balance,
      }),
      ...(input.last4 !== undefined && { last4: input.last4 }),
      ...(input.color !== undefined && { color: input.color }),
      ...(input.icon !== undefined && { icon: input.icon }),
      ...(input.include_in_total !== undefined && {
        includeInTotal: input.include_in_total,
      }),
    })
    .where(and(eq(accounts.id, accountId), eq(accounts.userId, userId)));

  return findOwnedAccount(userId, accountId);
};
