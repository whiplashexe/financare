import { and, eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { transactionTemplates } from "../../db/schema/transaction.templates.js";
import { TEMPLATE_MESSAGE } from "../../constants/response.message.js";
import { ApiError } from "../../utils/api.error.util.js";
import {
  findStoredResponse,
  storeResponse,
} from "../../utils/idempotency.util.js";
import { missingFields, templateColumns } from "../../utils/template.util.js";
import { TransactionValidation } from "../../validations/transaction.validation.js";
import { RecordTemplateInput } from "../../validations/template.validation.js";
import { createInTx } from "../transaction/transaction.create.service.js";

export const recordTemplate = async ({
  userId,
  templateId,
  overrides,
  idempotencyKey,
}: {
  userId: string;
  templateId: string;
  overrides: RecordTemplateInput;
  idempotencyKey?: string | undefined;
}) =>
  db.transaction(async (tx) => {
    const route = `POST /templates/${templateId}/record`;

    if (idempotencyKey) {
      const stored = await findStoredResponse(tx, userId, idempotencyKey, route);
      if (stored) return { replayed: true as const, data: stored };
    }

    const [template] = await tx
      .select(templateColumns)
      .from(transactionTemplates)
      .where(
        and(
          eq(transactionTemplates.id, templateId),
          eq(transactionTemplates.userId, userId),
        ),
      );
    if (!template) throw ApiError.notFound(TEMPLATE_MESSAGE.NOT_FOUND);

    const amount = overrides.amount ?? template.amount;
    const accountId = overrides.account_id ?? template.accountId;
    const toAccountId =
      overrides.to_account_id !== undefined
        ? overrides.to_account_id
        : template.toAccountId;

    const missing = missingFields({
      type: template.type,
      amount,
      accountId,
      toAccountId,
    });
    if (missing.length > 0) {
      throw ApiError.businessRule(TEMPLATE_MESSAGE.INCOMPLETE, { missing });
    }

    const parsed = TransactionValidation.CREATE.safeParse({
      type: template.type,
      name: overrides.name ?? template.transactionName,
      amount,
      date: overrides.date?.toISOString(),
      account_id: accountId,
      to_account_id: toAccountId ?? undefined,
      category_id:
        overrides.category_id !== undefined
          ? overrides.category_id
          : template.categoryId,
      location:
        overrides.location !== undefined ? overrides.location : template.location,
      note: overrides.note !== undefined ? overrides.note : template.note,
      tags: overrides.tags ?? template.tags,
      template_id: templateId,
    });
    if (!parsed.success) throw parsed.error;

    const data = await createInTx(tx, userId, parsed.data);

    if (idempotencyKey) {
      await storeResponse(tx, userId, idempotencyKey, route, data);
    }

    return { replayed: false as const, data };
  });
