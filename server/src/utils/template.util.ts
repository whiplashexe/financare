import { and, eq, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { accounts } from "../db/schema/accounts.js";
import { categories } from "../db/schema/categories.js";
import { transactionTemplates } from "../db/schema/transaction.templates.js";
import {
  ACCOUNT_MESSAGE,
  TEMPLATE_MESSAGE,
} from "../constants/response.message.js";
import { ApiError } from "./api.error.util.js";

export type TemplateType = "INCOME" | "OUTCOME" | "TRANSFER";

export const templateColumns = {
  id: transactionTemplates.id,
  name: transactionTemplates.name,
  type: transactionTemplates.type,
  transactionName: transactionTemplates.transactionName,
  amount: transactionTemplates.amount,
  accountId: transactionTemplates.accountId,
  toAccountId: transactionTemplates.toAccountId,
  categoryId: transactionTemplates.categoryId,
  location: transactionTemplates.location,
  note: transactionTemplates.note,
  tags: transactionTemplates.tags,
  useCount: transactionTemplates.useCount,
  lastUsedAt: transactionTemplates.lastUsedAt,
};

export type TemplateRow = {
  id: string;
  name: string;
  type: TemplateType;
  transactionName: string;
  amount: number | null;
  accountId: string | null;
  toAccountId: string | null;
  categoryId: string | null;
  location: string | null;
  note: string | null;
  tags: string[];
  useCount: number;
  lastUsedAt: Date | null;
};

export const missingFields = (state: {
  type: TemplateType;
  amount: number | null;
  accountId: string | null;
  toAccountId: string | null;
}) => {
  const missing: string[] = [];
  if (state.amount === null) missing.push("amount");
  if (!state.accountId) missing.push("account_id");
  if (state.type === "TRANSFER" && !state.toAccountId) {
    missing.push("to_account_id");
  }
  return missing;
};

export const toTemplateResponse = (row: TemplateRow) => ({
  id: row.id,
  name: row.name,
  type: row.type,
  transaction_name: row.transactionName,
  amount: row.amount,
  account_id: row.accountId,
  to_account_id: row.toAccountId,
  category_id: row.categoryId,
  location: row.location,
  note: row.note,
  tags: row.tags,
  use_count: row.useCount,
  last_used_at: row.lastUsedAt ? row.lastUsedAt.toISOString() : null,
  missing: missingFields(row),
});

export const findOwnedTemplate = async (userId: string, templateId: string) => {
  const [row] = await db
    .select(templateColumns)
    .from(transactionTemplates)
    .where(
      and(
        eq(transactionTemplates.id, templateId),
        eq(transactionTemplates.userId, userId),
      ),
    );

  if (!row) throw ApiError.notFound(TEMPLATE_MESSAGE.NOT_FOUND);
  return row;
};

export const assertNameAvailable = async ({
  userId,
  name,
  exceptId,
}: {
  userId: string;
  name: string;
  exceptId?: string;
}) => {
  const [taken] = await db
    .select({ id: transactionTemplates.id })
    .from(transactionTemplates)
    .where(
      and(
        eq(transactionTemplates.userId, userId),
        sql`lower(${transactionTemplates.name}) = ${name.toLowerCase()}`,
        exceptId ? sql`${transactionTemplates.id} <> ${exceptId}` : undefined,
      ),
    )
    .limit(1);

  if (taken) throw ApiError.conflict(TEMPLATE_MESSAGE.NAME_EXISTS);
};

const invalid = (field: string, message: string) =>
  ApiError.badRequest(message, { [field]: [message] });

export const validateTemplateState = async ({
  userId,
  state,
  checkAccounts,
  checkCategory,
}: {
  userId: string;
  state: {
    type: TemplateType;
    accountId: string | null;
    toAccountId: string | null;
    categoryId: string | null;
  };
  checkAccounts: string[];
  checkCategory: boolean;
}) => {
  if (state.type === "TRANSFER") {
    if (state.categoryId) {
      throw invalid("category_id", TEMPLATE_MESSAGE.TRANSFER_NEEDS_NO_CATEGORY);
    }
    if (
      state.accountId &&
      state.toAccountId &&
      state.accountId === state.toAccountId
    ) {
      throw invalid("to_account_id", TEMPLATE_MESSAGE.SAME_ACCOUNT);
    }
  } else if (state.toAccountId) {
    throw invalid("to_account_id", TEMPLATE_MESSAGE.ONLY_TRANSFER_DESTINATION);
  }

  for (const accountId of new Set(checkAccounts)) {
    const [account] = await db
      .select({ status: accounts.status })
      .from(accounts)
      .where(and(eq(accounts.id, accountId), eq(accounts.userId, userId)));
    if (!account) throw ApiError.notFound("Account not found");
    if (account.status === "ARCHIVED") {
      throw ApiError.businessRule(ACCOUNT_MESSAGE.ARCHIVED_NOT_ALLOWED);
    }
  }

  if (checkCategory && state.categoryId) {
    const [category] = await db
      .select({ type: categories.type })
      .from(categories)
      .where(
        and(eq(categories.id, state.categoryId), eq(categories.userId, userId)),
      );
    if (!category) throw ApiError.notFound("Category not found");
    if (category.type !== state.type) {
      throw ApiError.businessRule(TEMPLATE_MESSAGE.CATEGORY_TYPE_MISMATCH);
    }
  }
};
