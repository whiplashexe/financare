import { and, eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { oneTimePlans } from "../../db/schema/one.time.plans.js";
import { findOwnedOneTime } from "../../utils/onetime.util.js";

export const deleteOneTime = async ({
  userId,
  planId,
}: {
  userId: string;
  planId: string;
}) => {
  await findOwnedOneTime(db, userId, planId);

  await db
    .delete(oneTimePlans)
    .where(and(eq(oneTimePlans.id, planId), eq(oneTimePlans.userId, userId)));
};
