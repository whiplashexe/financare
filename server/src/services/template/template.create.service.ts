import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "../../db/index.js";
import { accounts } from "../../db/schema/accounts.js";
import { transactionTemplates } from "../../db/schema/transaction.templates.js";
import { transactions } from "../../db/schema/transactions.js";
import { TEMPLATE_MESSAGE } from "../../constants/response.message.js";
import { ApiError } from "../../utils/api.error.util.js";
import {
  assertNameAvailable,
  templateColumns,
  validateTemplateState,
  type TemplateType,
} from "../../utils/template.util.js";
import { CreateTemplateInput } from "../../validations/template.validation.js";

type Copied = {
  type: TemplateType;
  transactionName: string;
  amount: number | null;
  accountId: string | null;
  toAccountId: string | null;
  categoryId: string | null;
  location: string | null;
  note: string | null;
  tags: string[];
};

const copySource = async (userId: string, sourceId: string): Promise<Copied> => {
  const [source] = await db
    .select({
      type: transactions.type,
      name: transactions.name,
      amount: transactions.amount,
      accountId: transactions.accountId,
      toAccountId: transactions.toAccountId,
      categoryId: transactions.categoryId,
      location: transactions.location,
      note: transactions.note,
      tags: transactions.tags,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.id, sourceId),
        eq(transactions.userId, userId),
        isNull(transactions.deletedAt),
      ),
    );

  if (!source) throw ApiError.notFound(TEMPLATE_MESSAGE.SOURCE_NOT_FOUND);

  const accountIds = [source.accountId, source.toAccountId].filter(
    (id): id is string => Boolean(id),
  );
  const archived = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(inArray(accounts.id, accountIds), eq(accounts.status, "ARCHIVED")));
  const archivedIds = new Set(archived.map((row) => row.id));

  return {
    type: source.type,
    transactionName: source.name,
    amount: source.amount,
    accountId: archivedIds.has(source.accountId) ? null : source.accountId,
    toAccountId:
      source.toAccountId && !archivedIds.has(source.toAccountId)
        ? source.toAccountId
        : null,
    categoryId: source.categoryId,
    location: source.location,
    note: source.note,
    tags: source.tags,
  };
};

export const createTemplate = async ({
  userId,
  input,
}: {
  userId: string;
  input: CreateTemplateInput;
}) => {
  const base = input.source_transaction_id
    ? await copySource(userId, input.source_transaction_id)
    : undefined;

  const type = (input.type ?? base?.type)!;
  const state = {
    type,
    transactionName: (input.transaction_name ?? base?.transactionName)!,
    amount: input.amount !== undefined ? input.amount : (base?.amount ?? null),
    accountId:
      input.account_id !== undefined ? input.account_id : (base?.accountId ?? null),
    toAccountId:
      input.to_account_id !== undefined
        ? input.to_account_id
        : (base?.toAccountId ?? null),
    categoryId:
      input.category_id !== undefined
        ? input.category_id
        : (base?.categoryId ?? null),
    location: input.location !== undefined ? input.location : (base?.location ?? null),
    note: input.note !== undefined ? input.note : (base?.note ?? null),
    tags: input.tags ?? base?.tags ?? [],
  };

  await validateTemplateState({
    userId,
    state,
    checkAccounts: [input.account_id, input.to_account_id].filter(
      (id): id is string => Boolean(id),
    ),
    checkCategory: Boolean(input.category_id) || input.type !== undefined,
  });

  await assertNameAvailable({ userId, name: input.name });

  const [created] = await db
    .insert(transactionTemplates)
    .values({
      userId,
      name: input.name,
      type: state.type,
      transactionName: state.transactionName,
      amount: state.amount,
      accountId: state.accountId,
      toAccountId: state.toAccountId,
      categoryId: state.categoryId,
      location: state.location,
      note: state.note,
      tags: state.tags,
    })
    .returning(templateColumns);

  return created!;
};
