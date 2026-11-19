import { db } from "../../db/index.js";
import { loadTransactionDetail } from "../../utils/transaction.util.js";

export const getTransaction = async ({
  userId,
  transactionId,
}: {
  userId: string;
  transactionId: string;
}) => loadTransactionDetail(db, userId, transactionId);
