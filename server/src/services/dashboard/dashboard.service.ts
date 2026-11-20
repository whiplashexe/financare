import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { accounts } from "../../db/schema/accounts.js";
import { oneTimePlans } from "../../db/schema/one.time.plans.js";
import { recurringPlans } from "../../db/schema/recurring.plans.js";
import { transactions } from "../../db/schema/transactions.js";
import { users } from "../../db/schema/users.js";
import { accountColumns } from "../../utils/account.util.js";
import {
  oneTimeColumns,
  toFunding,
  type Balances,
} from "../../utils/onetime.util.js";
import { addDays } from "../../utils/recurrence.util.js";
import { planColumns } from "../../utils/recurring.util.js";
import {
  toTransactionSummary,
  transactionSummaryColumns,
} from "../../utils/transaction.util.js";

const RECENT_LIMIT = 5;
const UPCOMING_DAYS = 7;
const LIST_LIMIT = 20;

const byDueThenName = (
  a: { due: string; name: string },
  b: { due: string; name: string },
) => a.due.localeCompare(b.due) || a.name.localeCompare(b.name);

export const getDashboard = async ({ userId }: { userId: string }) => {
  const [context] = await db
    .select({
      today: sql<string>`(now() at time zone ${users.timezone})::date::text`,
      month: sql<string>`to_char(now() at time zone ${users.timezone}, 'YYYY-MM')`,
      timezone: users.timezone,
    })
    .from(users)
    .where(eq(users.id, userId));
  const { today, month, timezone } = context!;
  const horizon = addDays(today, UPCOMING_DAYS);

  const [accountRows, [summaryRow], recent, recurring, oneTime] = await Promise.all([
    db
      .select({
        id: accountColumns.id,
        name: accountColumns.name,
        type: accountColumns.type,
        status: accountColumns.status,
        includeInTotal: accountColumns.includeInTotal,
        balance: accountColumns.currentBalance,
      })
      .from(accounts)
      .where(eq(accounts.userId, userId))
      .orderBy(asc(accounts.createdAt), asc(sql`length(${accounts.id})`), asc(accounts.id)),

    db
      .select({
        income: sql<number>`coalesce(sum(${transactions.amount}) filter (where ${transactions.type} = 'INCOME'), 0)::bigint`.mapWith(Number),
        outcome: sql<number>`coalesce(sum(${transactions.amount}) filter (where ${transactions.type} = 'OUTCOME'), 0)::bigint`.mapWith(Number),
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          isNull(transactions.deletedAt),
          sql`${transactions.date} >= (date_trunc('month', now() at time zone ${timezone}))::timestamp at time zone ${timezone}`,
          sql`${transactions.date} < (date_trunc('month', now() at time zone ${timezone}) + interval '1 month')::timestamp at time zone ${timezone}`,
        ),
      ),

    db
      .select(transactionSummaryColumns)
      .from(transactions)
      .where(and(eq(transactions.userId, userId), isNull(transactions.deletedAt)))
      .orderBy(
        desc(transactions.date),
        desc(sql`length(${transactions.id})`),
        desc(transactions.id),
      )
      .limit(RECENT_LIMIT),

    db
      .select(planColumns)
      .from(recurringPlans)
      .where(and(eq(recurringPlans.userId, userId), eq(recurringPlans.status, "ACTIVE"))),

    db
      .select(oneTimeColumns)
      .from(oneTimePlans)
      .where(
        and(
          eq(oneTimePlans.userId, userId),
          inArray(oneTimePlans.status, ["PLANNED", "MISSED"]),
        ),
      ),
  ]);

  const balances: Balances = {
    byAccount: new Map(accountRows.map((row) => [row.id, row.balance])),
    total: accountRows
      .filter((row) => row.status === "ACTIVE" && row.includeInTotal)
      .reduce((sum, row) => sum + row.balance, 0),
  };

  const recurringFunding = (plan: (typeof recurring)[number]) => {
    if (plan.type !== "OUTCOME") return null;
    const available = balances.byAccount.get(plan.accountId) ?? 0;
    return {
      available,
      shortfall: Math.max(0, plan.amount - available),
      sufficient: available >= plan.amount,
    };
  };

  const inWindow = (date: string) => date >= today && date <= horizon;

  const upcoming = [
    ...recurring
      .filter((plan) => inWindow(plan.nextDueDate))
      .map((plan) => ({
        plan_type: "RECURRING" as const,
        plan_id: plan.id,
        name: plan.name,
        due: plan.nextDueDate,
        type: plan.type,
        amount: plan.amount,
        funding: recurringFunding(plan),
      })),
    ...oneTime
      .filter((plan) => plan.status === "PLANNED" && inWindow(plan.date))
      .map((plan) => ({
        plan_type: "ONE_TIME" as const,
        plan_id: plan.id,
        name: plan.name,
        due: plan.date,
        type: "OUTCOME" as const,
        amount: plan.targetAmount,
        funding: toFunding(plan, balances),
      })),
  ]
    .sort(byDueThenName)
    .slice(0, LIST_LIMIT);

  const actionNeeded = [
    ...recurring
      .filter((plan) => !plan.autoRecord && plan.nextDueDate <= today)
      .map((plan) => ({
        kind: "RECURRING_DUE" as const,
        plan_type: "RECURRING" as const,
        plan_id: plan.id,
        name: plan.name,
        due: plan.nextDueDate,
      })),
    ...recurring
      .filter((plan) => plan.accountArchived)
      .map((plan) => ({
        kind: "ACCOUNT_CHANGE_NEEDED" as const,
        plan_type: "RECURRING" as const,
        plan_id: plan.id,
        name: plan.name,
        due: plan.nextDueDate,
      })),
    ...oneTime
      .filter((plan) => plan.status === "MISSED")
      .map((plan) => ({
        kind: "ONE_TIME_MISSED" as const,
        plan_type: "ONE_TIME" as const,
        plan_id: plan.id,
        name: plan.name,
        due: plan.date,
      })),
  ]
    .sort(byDueThenName)
    .slice(0, LIST_LIMIT);

  return {
    total_balance: balances.total,
    accounts: accountRows
      .filter((row) => row.status === "ACTIVE")
      .map((row) => ({
        id: row.id,
        name: row.name,
        type: row.type,
        current_balance: row.balance,
        include_in_total: row.includeInTotal,
      })),
    month_summary: {
      month,
      income: summaryRow!.income,
      outcome: summaryRow!.outcome,
      net: summaryRow!.income - summaryRow!.outcome,
    },
    recent_transactions: recent.map(toTransactionSummary),
    upcoming_reminders: upcoming,
    action_needed: actionNeeded,
  };
};
