import z from "zod";
import { MAX_AMOUNT, id, instant } from "./transaction.validation.js";

const frequency = z.enum(["DAILY", "WEEKLY", "MONTHLY", "YEARLY"]);
const planType = z.enum(["INCOME", "OUTCOME"]);
const name = z.string().trim().min(1, "name is required").max(100);
const amount = z.number().int("amount must be an integer").min(1).max(MAX_AMOUNT);
const offset = z.union([z.literal(0), z.literal(1), z.literal(3), z.literal(7)]);

const reminderOffsets = z
  .array(offset)
  .min(1)
  .max(4)
  .refine((list) => new Set(list).size === list.length, {
    message: "reminder_offsets must not repeat a value",
  });

export class RecurringValidation {
  static CREATE = z
    .object({
      name,
      type: planType,
      amount,
      account_id: id,
      category_id: id.nullable().optional(),
      frequency,
      start_date: z.iso.date(),
      end_date: z.iso.date().nullable().optional(),
      reminder_offsets: reminderOffsets,
      auto_record: z.boolean().default(false),
    })
    .strict()
    .refine((plan) => !plan.end_date || plan.end_date > plan.start_date, {
      message: "the end date must be after the start date",
      path: ["end_date"],
    });

  static UPDATE = z
    .object({
      name: name.optional(),
      type: planType.optional(),
      amount: amount.optional(),
      account_id: id.optional(),
      category_id: id.nullable().optional(),
      frequency: frequency.optional(),
      end_date: z.iso.date().nullable().optional(),
      reminder_offsets: reminderOffsets.optional(),
      auto_record: z.boolean().optional(),
    })
    .strict()
    .refine((value) => Object.keys(value).length > 0, {
      message: "at least one field is required",
    });

  static LIST_QUERY = z
    .object({
      status: z.enum(["ACTIVE", "PAUSED", "ENDED", "ALL"]).default("ALL"),
    })
    .strict();

  static CONFIRM = z
    .object({
      amount: amount.optional(),
      date: instant.optional(),
      account_id: id.optional(),
    })
    .strict()
    .default({});

  static PARAMS = z.object({ id });

  static OCCURRENCE_PARAMS = z.object({ id, dueDate: z.iso.date() });
}

export type CreatePlanInput = z.infer<typeof RecurringValidation.CREATE>;
export type UpdatePlanInput = z.infer<typeof RecurringValidation.UPDATE>;
export type ListPlansQuery = z.infer<typeof RecurringValidation.LIST_QUERY>;
export type ConfirmOccurrenceInput = z.infer<typeof RecurringValidation.CONFIRM>;
