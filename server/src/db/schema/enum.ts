import { pgEnum } from "drizzle-orm/pg-core";

export const transactionTypeEnum = pgEnum("transaction_type", [
  "INCOME",
  "OUTCOME",
  "TRANSFER",
]);
