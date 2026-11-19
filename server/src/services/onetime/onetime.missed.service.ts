import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { oneTimePlans } from "../../db/schema/one.time.plans.js";
import { users } from "../../db/schema/users.js";

export const markMissedPlans = async () => {
  const rows = await db
    .update(oneTimePlans)
    .set({ status: "MISSED" })
    .from(users)
    .where(
      and(
        eq(users.id, oneTimePlans.userId),
        eq(oneTimePlans.status, "PLANNED"),
        isNull(users.deletedAt),
        sql`${oneTimePlans.date} < (now() at time zone ${users.timezone})::date`,
      ),
    )
    .returning({ id: oneTimePlans.id });

  return { missed: rows.length, planIds: rows.map((row) => row.id) };
};
