import z from "zod";

const MAX_AMOUNT = 999_999_999_999;

const name = z.string().trim().min(1, "name is required").max(50);

const institution = z
  .string()
  .trim()
  .max(50)
  .transform((v) => (v === "" ? null : v))
  .nullable();

const initialBalance = z
  .number()
  .int("initial_balance must be an integer")
  .min(-MAX_AMOUNT)
  .max(MAX_AMOUNT);

const last4 = z
  .string()
  .regex(/^[0-9]{4}$/, "last4 must be exactly 4 digits")
  .nullable();

const color = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$/, "color must be #RRGGBB or #RRGGBBAA")
  .nullable();

const icon = z.string().trim().min(1).max(50).nullable();

const accountType = z.enum(["BANK", "EWALLET", "CASH"]);

const atLeastOneField = (value: object) =>
  Object.keys(value).filter((key) => key !== "confirm").length > 0;

export class AccountValidation {
  static CREATE = z
    .object({
      name,
      type: accountType,
      institution: institution.optional(),
      initial_balance: initialBalance.default(0),
      last4: last4.optional(),
      color: color.optional(),
      icon: icon.optional(),
      include_in_total: z.boolean().default(true),
    })
    .strict()
    .refine((a) => a.type !== "CASH" || !a.institution, {
      message: "a cash account cannot have an institution",
      path: ["institution"],
    });

  static UPDATE = z
    .object({
      name: name.optional(),
      type: accountType.optional(),
      institution: institution.optional(),
      initial_balance: initialBalance.optional(),
      last4: last4.optional(),
      color: color.optional(),
      icon: icon.optional(),
      include_in_total: z.boolean().optional(),
      confirm: z.boolean().optional(),
    })
    .strict()
    .refine(atLeastOneField, { message: "at least one field is required" });

  static LIST_QUERY = z
    .object({
      status: z.enum(["ACTIVE", "ARCHIVED", "ALL"]).default("ACTIVE"),
    })
    .strict();

  static PARAMS = z.object({ id: z.string().min(1).max(20) });
}

export type CreateAccountInput = z.infer<typeof AccountValidation.CREATE>;
export type UpdateAccountInput = z.infer<typeof AccountValidation.UPDATE>;
export type ListAccountsQuery = z.infer<typeof AccountValidation.LIST_QUERY>;
