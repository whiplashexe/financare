import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { recurringPlans } from "../../db/schema/recurring.plans.js";
import { planColumns } from "../../utils/recurring.util.js";
import { ListPlansQuery } from "../../validations/recurring.validation.js";

export const listPlans = async ({
  userId,
  query,
}: {
  userId: string;
  query: ListPlansQuery;
}) =>
  db
    .select(planColumns)
    .from(recurringPlans)
    .where(
      and(
        eq(recurringPlans.userId, userId),
        query.status === "ALL" ? undefined : eq(recurringPlans.status, query.status),
      ),
    )
    .orderBy(
      asc(sql`case when ${recurringPlans.status} = 'ENDED' then 1 else 0 end`),
      asc(recurringPlans.nextDueDate),
      asc(recurringPlans.createdAt),
      asc(sql`length(${recurringPlans.id})`),
      asc(recurringPlans.id),
    );
