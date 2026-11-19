import z from "zod";
import { MAX_AMOUNT, id, instant, tags } from "./transaction.validation.js";

const type = z.enum(["INCOME", "OUTCOME", "TRANSFER"]);
const templateName = z.string().trim().min(1, "name is required").max(50);
const transactionName = z
  .string()
  .trim()
  .min(1, "transaction_name is required")
  .max(100);
const amount = z.number().int("amount must be an integer").min(1).max(MAX_AMOUNT);
const location = z.string().trim().max(255);
const note = z.string().trim().max(1000);

const atLeastOneField = (value: object) => Object.keys(value).length > 0;

export class TemplateValidation {
  static CREATE = z
    .object({
      name: templateName,
      source_transaction_id: id.optional(),
      type: type.optional(),
      transaction_name: transactionName.optional(),
      amount: amount.nullable().optional(),
      account_id: id.nullable().optional(),
      to_account_id: id.nullable().optional(),
      category_id: id.nullable().optional(),
      location: location.nullable().optional(),
      note: note.nullable().optional(),
      tags: tags.optional(),
    })
    .strict()
    .superRefine((value, ctx) => {
      if (value.source_transaction_id) return;
      if (!value.type) {
        ctx.addIssue({
          code: "custom",
          message: "type is required when there is no source transaction",
          path: ["type"],
        });
      }
      if (!value.transaction_name) {
        ctx.addIssue({
          code: "custom",
          message: "transaction_name is required when there is no source transaction",
          path: ["transaction_name"],
        });
      }
    });

  static UPDATE = z
    .object({
      name: templateName.optional(),
      type: type.optional(),
      transaction_name: transactionName.optional(),
      amount: amount.nullable().optional(),
      account_id: id.nullable().optional(),
      to_account_id: id.nullable().optional(),
      category_id: id.nullable().optional(),
      location: location.nullable().optional(),
      note: note.nullable().optional(),
      tags: tags.optional(),
    })
    .strict()
    .refine(atLeastOneField, { message: "at least one field is required" });

  static RECORD = z
    .object({
      name: transactionName.optional(),
      amount: amount.optional(),
      date: instant.optional(),
      account_id: id.optional(),
      to_account_id: id.nullable().optional(),
      category_id: id.nullable().optional(),
      location: location.nullable().optional(),
      note: note.nullable().optional(),
      tags: tags.optional(),
    })
    .strict()
    .default({});

  static PARAMS = z.object({ id });
}

export type CreateTemplateInput = z.infer<typeof TemplateValidation.CREATE>;
export type UpdateTemplateInput = z.infer<typeof TemplateValidation.UPDATE>;
export type RecordTemplateInput = z.infer<typeof TemplateValidation.RECORD>;
