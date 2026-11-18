import { findOwnedAccount } from "../../utils/account.util.js";

export const getAccount = async ({
  userId,
  accountId,
}: {
  userId: string;
  accountId: string;
}) => findOwnedAccount(userId, accountId);
