import { db } from "../../db/index.js";
import { accounts } from "../../db/schema/accounts.js";
import { findOwnedAccount } from "../../utils/account.util.js";
import { CreateAccountInput } from "../../validations/account.validation.js";

export const createAccount = async ({
  userId,
  input,
}: {
  userId: string;
  input: CreateAccountInput;
}) => {
  const [created] = await db
    .insert(accounts)
    .values({
      userId,
      name: input.name,
      type: input.type,
      institution: input.institution ?? null,
      initialBalance: input.initial_balance,
      last4: input.last4 ?? null,
      color: input.color ?? null,
      icon: input.icon ?? null,
      includeInTotal: input.include_in_total,
    })
    .returning({ id: accounts.id });

  return findOwnedAccount(userId, created!.id);
};
