import {
  resolveRecurringReminders,
  syncRecurringReminders,
} from "../../utils/reminder.util.js";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { planOccurrences } from "../../db/schema/plan.occurrences.js";
import { recurringPlans } from "../../db/schema/recurring.plans.js";
import { users } from "../../db/schema/users.js";
import { ApiError } from "../../utils/api.error.util.js";
import { advancePlan } from "../../utils/recurring.advance.util.js";
import { findOwnedPlan, userToday } from "../../utils/recurring.util.js";
import { TransactionValidation } from "../../validations/transaction.validation.js";
import { createInTx } from "../transaction/transaction.create.service.js";

const MAX_CATCH_UP = 400;

type PlanResult =
  | { planId: string; recorded: number }
  | { planId: string; skipped: string };

const localDayStart = async (
  tx: Pick<typeof db, "select">,
  userId: string,
  day: string,
) => {
  const [row] = await tx
    .select({
      start: sql<string>`(${day}::date::timestamp at time zone ${users.timezone})`,
    })
    .from(users)
    .where(eq(users.id, userId));
  return new Date(row!.start);
};

const processPlan = (planId: string, userId: string): Promise<PlanResult> =>
  db.transaction(async (tx) => {
    const [locked] = await tx
      .select({ id: recurringPlans.id })
      .from(recurringPlans)
      .where(eq(recurringPlans.id, planId))
      .for("update", { skipLocked: true });

    if (!locked) return { planId, skipped: "LOCKED" };

    const today = await userToday(tx, userId);
    let plan = await findOwnedPlan(tx, userId, planId);

    if (plan.status !== "ACTIVE" || !plan.autoRecord) {
      return { planId, skipped: "NOT_ELIGIBLE" };
    }
    if (plan.accountArchived) return { planId, skipped: "ACCOUNT_ARCHIVED" };

    let recorded = 0;

    for (let step = 0; step < MAX_CATCH_UP; step++) {
      if (plan.status !== "ACTIVE" || plan.nextDueDate > today) break;

      const dueDate = plan.nextDueDate;

      const [already] = await tx
        .select({ id: planOccurrences.id })
        .from(planOccurrences)
        .where(
          and(
            eq(planOccurrences.recurringPlanId, planId),
            eq(planOccurrences.dueDate, dueDate),
          ),
        );

      if (!already) {
        const parsed = TransactionValidation.CREATE.safeParse({
          type: plan.type,
          name: plan.name,
          amount: plan.amount,
          date: (await localDayStart(tx, userId, dueDate)).toISOString(),
          account_id: plan.accountId,
          category_id: plan.categoryId,
          plan_id: plan.id,
        });
        if (!parsed.success) throw parsed.error;

        const created = await createInTx(tx, userId, parsed.data, {
          source: "AUTO",
        });

        await tx.insert(planOccurrences).values({
          recurringPlanId: planId,
          dueDate,
          outcome: "AUTO_RECORDED",
          transactionId: created.transaction.id,
        });
        recorded++;
      }

      const next = await advancePlan(tx, plan, dueDate);
      await resolveRecurringReminders(tx, planId, dueDate);
      plan = await findOwnedPlan(tx, userId, planId);
      if (next === null) break;
    }

    await syncRecurringReminders(tx, planId);

    return { planId, recorded };
  });

export const autoRecordDuePlans = async () => {
  const due = await db
    .select({ id: recurringPlans.id, userId: recurringPlans.userId })
    .from(recurringPlans)
    .innerJoin(users, eq(users.id, recurringPlans.userId))
    .where(
      and(
        eq(recurringPlans.status, "ACTIVE"),
        eq(recurringPlans.autoRecord, true),
        isNull(users.deletedAt),
        sql`${recurringPlans.nextDueDate} <= (now() at time zone ${users.timezone})::date`,
      ),
    );

  const results: PlanResult[] = [];
  for (const plan of due) {
    try {
      results.push(await processPlan(plan.id, plan.userId));
    } catch (error) {
      results.push({
        planId: plan.id,
        skipped: error instanceof ApiError ? error.code : "ERROR",
      });
    }
  }

  return {
    recorded: results.reduce(
      (sum, result) => sum + ("recorded" in result ? result.recorded : 0),
      0,
    ),
    plans: results,
  };
};
