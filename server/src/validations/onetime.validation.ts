import z from "zod";
import { MAX_AMOUNT, id, instant } from "./transaction.validation.js";

const name = z.string().trim().min(1, "name is required").max(100);
const targetAmount = z
  .number()
  .int("target_amount must be an integer")
  .min(1)
  .max(MAX_AMOUNT);
const offset = z.union([z.literal(1), z.literal(3), z.literal(7), z.literal(14)]);

const reminderOffsets = z
  .array(offset)
  .min(1)
  .max(4)
  .refine((list) => new Set(list).size === list.length, {
    message: "reminder_offsets must not repeat a value",
  });

export class OneTimeValidation {
  static CREATE = z
    .object({
      name,
      date: z.iso.date(),
      target_amount: targetAmount,
      source_account_id: id.nullable().optional(),
      location: z.string().trim().max(255).nullable().optional(),
      note: z.string().trim().max(1000).nullable().optional(),
      reminder_offsets: reminderOffsets,
    })
    .strict();

  static UPDATE = z
    .object({
      name: name.optional(),
      date: z.iso.date().optional(),
      target_amount: targetAmount.optional(),
      source_account_id: id.nullable().optional(),
      location: z.string().trim().max(255).nullable().optional(),
      note: z.string().trim().max(1000).nullable().optional(),
      reminder_offsets: reminderOffsets.optional(),
    })
    .strict()
    .refine((value) => Object.keys(value).length > 0, {
      message: "at least one field is required",
    });

  static COMPLETE = z
    .object({
      create_transaction: z.boolean().default(false),
      amount: z
        .number()
        .int("amount must be an integer")
        .min(1)
        .max(MAX_AMOUNT)
        .optional(),
      account_id: id.optional(),
      date: instant.optional(),
    })
    .strict()
    .superRefine((value, ctx) => {
      if (value.create_transaction) return;
      for (const field of ["amount", "account_id", "date"] as const) {
        if (value[field] !== undefined) {
          ctx.addIssue({
            code: "custom",
            message: "only used with create_transaction: true",
            path: [field],
          });
        }
      }
    })
    .default({ create_transaction: false });

  static LIST_QUERY = z
    .object({
      status: z.enum(["PLANNED", "DONE", "MISSED", "CANCELLED", "ALL"]).default("ALL"),
    })
    .strict();

  static PARAMS = z.object({ id });
}

export type CreateOneTimeInput = z.infer<typeof OneTimeValidation.CREATE>;
export type UpdateOneTimeInput = z.infer<typeof OneTimeValidation.UPDATE>;
export type CompleteOneTimeInput = z.infer<typeof OneTimeValidation.COMPLETE>;
export type ListOneTimeQuery = z.infer<typeof OneTimeValidation.LIST_QUERY>;
