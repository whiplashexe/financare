import z from "zod";

const name = z.string().trim().min(1, "name is required").max(50);
const icon = z.string().trim().min(1).max(50).nullable();
const categoryType = z.enum(["INCOME", "OUTCOME"]);

export class CategoryValidation {
  static CREATE = z
    .object({
      name,
      type: categoryType,
      icon: icon.optional(),
    })
    .strict();

  static UPDATE = z
    .object({
      name: name.optional(),
      icon: icon.optional(),
    })
    .strict()
    .refine((value) => Object.keys(value).length > 0, {
      message: "at least one field is required",
    });

  static LIST_QUERY = z.object({ type: categoryType.optional() }).strict();

  static DELETE_QUERY = z
    .object({
      confirm: z
        .enum(["true", "false"])
        .default("false")
        .transform((value) => value === "true"),
    })
    .strict();

  static PARAMS = z.object({ id: z.string().min(1).max(20) });
}

export type CreateCategoryInput = z.infer<typeof CategoryValidation.CREATE>;
export type UpdateCategoryInput = z.infer<typeof CategoryValidation.UPDATE>;
export type ListCategoriesQuery = z.infer<typeof CategoryValidation.LIST_QUERY>;
export type DeleteCategoryQuery = z.infer<
  typeof CategoryValidation.DELETE_QUERY
>;
