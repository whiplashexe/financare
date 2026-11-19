import { and, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { oneTimePlans } from "../db/schema/one.time.plans.js";
import { ONE_TIME_MESSAGE } from "../constants/response.message.js";
import { loadBalances } from "./account.util.js";
import { ApiError } from "./api.error.util.js";

export type OneTimeExecutor = Pick<typeof db, "select">;

export const oneTimeColumns = {
  id: oneTimePlans.id,
  userId: oneTimePlans.userId,
  sourceAccountId: oneTimePlans.sourceAccountId,
  name: oneTimePlans.name,
  date: oneTimePlans.date,
  targetAmount: oneTimePlans.targetAmount,
  location: oneTimePlans.location,
  note: oneTimePlans.note,
  reminderOffsets: oneTimePlans.reminderOffsets,
  status: oneTimePlans.status,
};

export type OneTimeRow = {
  id: string;
  userId: string;
  sourceAccountId: string | null;
  name: string;
  date: string;
  targetAmount: number;
  location: string | null;
  note: string | null;
  reminderOffsets: number[];
  status: "PLANNED" | "DONE" | "MISSED" | "CANCELLED";
};

export type Balances = Awaited<ReturnType<typeof loadBalances>>;

export const toFunding = (row: OneTimeRow, balances: Balances) => {
  if (row.status === "DONE" || row.status === "CANCELLED") return null;

  const available = row.sourceAccountId
    ? (balances.byAccount.get(row.sourceAccountId) ?? 0)
    : balances.total;

  return {
    available,
    shortfall: Math.max(0, row.targetAmount - available),
    sufficient: available >= row.targetAmount,
  };
};

export const toOneTimeResponse = (row: OneTimeRow, balances: Balances) => ({
  id: row.id,
  name: row.name,
  date: row.date,
  target_amount: row.targetAmount,
  source_account_id: row.sourceAccountId,
  location: row.location,
  note: row.note,
  reminder_offsets: row.reminderOffsets,
  status: row.status,
  funding: toFunding(row, balances),
});

export const findOwnedOneTime = async (
  executor: OneTimeExecutor,
  userId: string,
  planId: string,
) => {
  const [row] = await executor
    .select(oneTimeColumns)
    .from(oneTimePlans)
    .where(and(eq(oneTimePlans.id, planId), eq(oneTimePlans.userId, userId)));

  if (!row) throw ApiError.notFound(ONE_TIME_MESSAGE.NOT_FOUND);
  return row;
};

export const presentOneTime = async (
  executor: OneTimeExecutor,
  userId: string,
  planId: string,
) => {
  const row = await findOwnedOneTime(executor, userId, planId);
  return toOneTimeResponse(row, await loadBalances(executor, userId));
};
