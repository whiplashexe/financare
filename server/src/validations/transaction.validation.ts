import z from "zod";
import { rangeOrdered } from "../utils/date.range.util.js";

export const MAX_AMOUNT = 999_999_999_999;

export const id = z.string().min(1).max(20);

export const instant = z.iso
  .datetime({ offset: true })
  .transform((value) => new Date(value));

export const tags = z
  .array(z.string().trim().min(1, "a tag must not be empty").max(30))
  .max(50)
  .transform((list) => [...new Set(list.map((tag) => tag.toLowerCase()))])
  .refine((list) => list.length <= 10, { message: "at most 10 tags" });

const quantity = z
  .number()
  .positive()
  .max(9_999_999.999)
  .refine((value) => Math.abs(value * 1000 - Math.round(value * 1000)) < 1e-6, {
    message: "quantity allows up to 3 decimals",
  });

export const imageInput = z
  .object({
    public_id: z.string().trim().min(1).max(255),
    mime_type: z.enum(["image/jpeg", "image/png", "image/heic"]),
    size: z.number().int().min(1).max(5_242_880),
  })
  .strict();

const item = z
  .object({
    name: z.string().trim().min(1, "item name is required").max(150),
    quantity: quantity.default(1),
    unit: z
      .string()
      .trim()
      .max(20)
      .transform((value) => (value === "" ? null : value))
      .nullable()
      .optional(),
    total_price: z.number().int().min(0).max(MAX_AMOUNT),
  })
  .strict();

export const dayOrInstant = z.union([
  z.iso.date().transform((value) => ({ kind: "date" as const, value })),
  instant.transform((value) => ({ kind: "instant" as const, value })),
]);

export class TransactionValidation {
  static CREATE = z
    .object({
      type: z.enum(["INCOME", "OUTCOME", "TRANSFER"]),
      name: z.string().trim().min(1, "name is required").max(100),
      amount: z.number().int("amount must be an integer").min(1).max(MAX_AMOUNT),
      date: instant.optional(),
      account_id: id,
      to_account_id: id.nullable().optional(),
      admin_fee: z.number().int().min(0).max(MAX_AMOUNT).optional(),
      category_id: id.nullable().optional(),
      location: z.string().trim().max(255).nullable().optional(),
      note: z.string().trim().max(1000).nullable().optional(),
      tags: tags.optional(),
      plan_id: id.nullable().optional(),
      template_id: id.nullable().optional(),
      items: z.array(item).max(100).optional(),
      images: z.array(imageInput).max(50).optional(),
    })
    .strict()
    .superRefine((value, ctx) => {
      const issue = (path: string, message: string) =>
        ctx.addIssue({ code: "custom", message, path: [path] });

      if (value.type === "TRANSFER") {
        if (!value.to_account_id) {
          issue("to_account_id", "to_account_id is required for a transfer");
        } else if (value.to_account_id === value.account_id) {
          issue("to_account_id", "source and destination must differ");
        }
        if (value.category_id) {
          issue("category_id", "a transfer has no category");
        }
        if (value.items && value.items.length > 0) {
          issue("items", "a transfer cannot have items");
        }
        return;
      }

      if (value.to_account_id) {
        issue("to_account_id", "only a transfer has a destination account");
      }
      if (value.admin_fee !== undefined) {
        issue("admin_fee", "only a transfer has an admin fee");
      }
    });

  static UPDATE = z
    .object({
      type: z.enum(["INCOME", "OUTCOME", "TRANSFER"]).optional(),
      name: z.string().trim().min(1, "name is required").max(100).optional(),
      amount: z
        .number()
        .int("amount must be an integer")
        .min(1)
        .max(MAX_AMOUNT)
        .optional(),
      date: instant.optional(),
      account_id: id.optional(),
      to_account_id: id.nullable().optional(),
      admin_fee: z.number().int().min(0).max(MAX_AMOUNT).optional(),
      category_id: id.nullable().optional(),
      location: z.string().trim().max(255).nullable().optional(),
      note: z.string().trim().max(1000).nullable().optional(),
      tags: tags.optional(),
      plan_id: id.nullable().optional(),
      items: z.array(item).max(100).optional(),
    })
    .strict()
    .refine((value) => Object.keys(value).length > 0, {
      message: "at least one field is required",
    })
    .refine(
      (value) =>
        !value.to_account_id ||
        !value.account_id ||
        value.to_account_id !== value.account_id,
      { message: "source and destination must differ", path: ["to_account_id"] },
    );

  static SIGN = z
    .object({ count: z.number().int().min(1).max(5) })
    .strict();

  static ADD_IMAGE = imageInput;

  static REORDER_IMAGES = z
    .object({
      ids: z
        .array(id)
        .min(1)
        .max(5)
        .refine((list) => new Set(list).size === list.length, {
          message: "ids must not repeat a value",
        }),
    })
    .strict();

  static IMAGE_PARAMS = z.object({ id, imageId: id });

  static DELETE_QUERY = z
    .object({
      permanent: z
        .enum(["true", "false"])
        .default("false")
        .transform((value) => value === "true"),
    })
    .strict();

  static TRASH_QUERY = z
    .object({
      cursor: id.optional(),
      limit: z.coerce.number().int().min(1).max(100).default(20),
    })
    .strict();

  static LIST_QUERY = z
    .object({
      from: dayOrInstant.optional(),
      to: dayOrInstant.optional(),
      type: z.enum(["INCOME", "OUTCOME", "TRANSFER"]).optional(),
      account_id: id.optional(),
      category_id: id.optional(),
      q: z.string().trim().min(1).max(100).optional(),
      tag: z
        .string()
        .trim()
        .min(1)
        .max(30)
        .transform((value) => value.toLowerCase())
        .optional(),
      cursor: id.optional(),
      limit: z.coerce.number().int().min(1).max(100).default(20),
    })
    .strict()
    .refine((query) => rangeOrdered(query.from, query.to), {
      message: "from must not be after to",
      path: ["from"],
    });

  static PARAMS = z.object({ id });
}

export type CreateTransactionInput = z.infer<typeof TransactionValidation.CREATE>;
export type ListTransactionsQuery = z.infer<
  typeof TransactionValidation.LIST_QUERY
>;
export type UpdateTransactionInput = z.infer<typeof TransactionValidation.UPDATE>;
export type DeleteTransactionQuery = z.infer<
  typeof TransactionValidation.DELETE_QUERY
>;
export type TrashQuery = z.infer<typeof TransactionValidation.TRASH_QUERY>;
export type ImageInput = z.infer<typeof imageInput>;
export type ReorderImagesInput = z.infer<typeof TransactionValidation.REORDER_IMAGES>;
