import { and, eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { transactionTemplates } from "../../db/schema/transaction.templates.js";
import {
  assertNameAvailable,
  findOwnedTemplate,
  templateColumns,
  validateTemplateState,
} from "../../utils/template.util.js";
import { UpdateTemplateInput } from "../../validations/template.validation.js";

export const updateTemplate = async ({
  userId,
  templateId,
  input,
}: {
  userId: string;
  templateId: string;
  input: UpdateTemplateInput;
}) => {
  const current = await findOwnedTemplate(userId, templateId);

  const state = {
    type: input.type ?? current.type,
    accountId:
      input.account_id !== undefined ? input.account_id : current.accountId,
    toAccountId:
      input.to_account_id !== undefined ? input.to_account_id : current.toAccountId,
    categoryId:
      input.category_id !== undefined ? input.category_id : current.categoryId,
  };

  const changedAccounts: string[] = [];
  if (input.account_id && input.account_id !== current.accountId) {
    changedAccounts.push(input.account_id);
  }
  if (input.to_account_id && input.to_account_id !== current.toAccountId) {
    changedAccounts.push(input.to_account_id);
  }

  await validateTemplateState({
    userId,
    state,
    checkAccounts: changedAccounts,
    checkCategory: Boolean(input.category_id) || input.type !== undefined,
  });

  if (input.name !== undefined && input.name.toLowerCase() !== current.name.toLowerCase()) {
    await assertNameAvailable({ userId, name: input.name, exceptId: templateId });
  }

  const [updated] = await db
    .update(transactionTemplates)
    .set({
      ...(input.name !== undefined && { name: input.name }),
      ...(input.type !== undefined && { type: input.type }),
      ...(input.transaction_name !== undefined && {
        transactionName: input.transaction_name,
      }),
      ...(input.amount !== undefined && { amount: input.amount }),
      ...(input.account_id !== undefined && { accountId: input.account_id }),
      ...(input.to_account_id !== undefined && { toAccountId: input.to_account_id }),
      ...(input.category_id !== undefined && { categoryId: input.category_id }),
      ...(input.location !== undefined && { location: input.location }),
      ...(input.note !== undefined && { note: input.note }),
      ...(input.tags !== undefined && { tags: input.tags }),
    })
    .where(
      and(
        eq(transactionTemplates.id, templateId),
        eq(transactionTemplates.userId, userId),
      ),
    )
    .returning(templateColumns);

  return updated!;
};
