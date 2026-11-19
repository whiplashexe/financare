import { desc, eq, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { transactionTemplates } from "../../db/schema/transaction.templates.js";
import { templateColumns } from "../../utils/template.util.js";

export const listTemplates = async ({ userId }: { userId: string }) =>
  db
    .select(templateColumns)
    .from(transactionTemplates)
    .where(eq(transactionTemplates.userId, userId))
    .orderBy(
      desc(transactionTemplates.useCount),
      sql`${transactionTemplates.lastUsedAt} desc nulls last`,
      desc(transactionTemplates.createdAt),
      desc(sql`length(${transactionTemplates.id})`),
      desc(transactionTemplates.id),
    );
