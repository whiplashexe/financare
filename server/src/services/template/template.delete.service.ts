import { and, eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { transactionTemplates } from "../../db/schema/transaction.templates.js";
import { findOwnedTemplate } from "../../utils/template.util.js";

export const deleteTemplate = async ({
  userId,
  templateId,
}: {
  userId: string;
  templateId: string;
}) => {
  await findOwnedTemplate(userId, templateId);

  await db
    .delete(transactionTemplates)
    .where(
      and(
        eq(transactionTemplates.id, templateId),
        eq(transactionTemplates.userId, userId),
      ),
    );
};
