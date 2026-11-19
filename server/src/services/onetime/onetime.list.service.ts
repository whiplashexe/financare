import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { oneTimePlans } from "../../db/schema/one.time.plans.js";
import { loadBalances } from "../../utils/account.util.js";
import { oneTimeColumns, toOneTimeResponse } from "../../utils/onetime.util.js";
import { ListOneTimeQuery } from "../../validations/onetime.validation.js";

export const listOneTime = async ({
  userId,
  query,
}: {
  userId: string;
  query: ListOneTimeQuery;
}) => {
  const rows = await db
    .select(oneTimeColumns)
    .from(oneTimePlans)
    .where(
      and(
        eq(oneTimePlans.userId, userId),
        query.status === "ALL" ? undefined : eq(oneTimePlans.status, query.status),
      ),
    )
    .orderBy(
      asc(
        sql`case when ${oneTimePlans.status} in ('DONE', 'CANCELLED') then 1 else 0 end`,
      ),
      asc(oneTimePlans.date),
      asc(oneTimePlans.createdAt),
      asc(sql`length(${oneTimePlans.id})`),
      asc(oneTimePlans.id),
    );

  const balances = await loadBalances(db, userId);
  return rows.map((row) => toOneTimeResponse(row, balances));
};
