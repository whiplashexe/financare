import { and, eq, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { accounts } from "../db/schema/accounts.js";
import { recurringPlans } from "../db/schema/recurring.plans.js";
import { users } from "../db/schema/users.js";
import { PLAN_MESSAGE } from "../constants/response.message.js";
import { ApiError } from "./api.error.util.js";
import { type Frequency } from "./recurrence.util.js";

export type PlanExecutor = Pick<typeof db, "select">;

export const planColumns = {
  id: recurringPlans.id,
  userId: recurringPlans.userId,
  accountId: recurringPlans.accountId,
  categoryId: recurringPlans.categoryId,
  name: recurringPlans.name,
  type: recurringPlans.type,
  amount: recurringPlans.amount,
  frequency: recurringPlans.frequency,
  startDate: recurringPlans.startDate,
  endDate: recurringPlans.endDate,
  reminderOffsets: recurringPlans.reminderOffsets,
  autoRecord: recurringPlans.autoRecord,
  nextDueDate: recurringPlans.nextDueDate,
  status: recurringPlans.status,
  accountArchived: sql<boolean>`exists (
    select 1 from ${accounts}
    where ${accounts.id} = ${recurringPlans.accountId} and ${accounts.status} = 'ARCHIVED'
  )`,
};

export type PlanRow = {
  id: string;
  userId: string;
  accountId: string;
  categoryId: string | null;
  name: string;
  type: "INCOME" | "OUTCOME" | "TRANSFER";
  amount: number;
  frequency: Frequency;
  startDate: string;
  endDate: string | null;
  reminderOffsets: number[];
  autoRecord: boolean;
  nextDueDate: string;
  status: "ACTIVE" | "PAUSED" | "ENDED";
  accountArchived: boolean;
};

export const toPlanResponse = (row: PlanRow) => ({
  id: row.id,
  name: row.name,
  type: row.type,
  amount: row.amount,
  account_id: row.accountId,
  category_id: row.categoryId,
  frequency: row.frequency,
  start_date: row.startDate,
  end_date: row.endDate,
  reminder_offsets: row.reminderOffsets,
  auto_record: row.autoRecord,
  status: row.status,
  next_due_date: row.status === "ENDED" ? null : row.nextDueDate,
  needs_account_change: row.status === "ACTIVE" && row.accountArchived,
});

export const findOwnedPlan = async (
  executor: PlanExecutor,
  userId: string,
  planId: string,
) => {
  const [row] = await executor
    .select(planColumns)
    .from(recurringPlans)
    .where(and(eq(recurringPlans.id, planId), eq(recurringPlans.userId, userId)));

  if (!row) throw ApiError.notFound(PLAN_MESSAGE.NOT_FOUND);
  return row;
};

export const userToday = async (executor: PlanExecutor, userId: string) => {
  const [row] = await executor
    .select({
      today: sql<string>`(now() at time zone ${users.timezone})::date::text`,
    })
    .from(users)
    .where(eq(users.id, userId));

  return row!.today;
};
