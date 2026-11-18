import { db } from "../../db/index.js";
import { categories } from "../../db/schema/categories.js";
import {
  assertNameAvailable,
  categoryColumns,
} from "../../utils/category.util.js";
import { CreateCategoryInput } from "../../validations/category.validation.js";

export const createCategory = async ({
  userId,
  input,
}: {
  userId: string;
  input: CreateCategoryInput;
}) => {
  await assertNameAvailable({ userId, type: input.type, name: input.name });

  const [created] = await db
    .insert(categories)
    .values({
      userId,
      name: input.name,
      type: input.type,
      icon: input.icon ?? null,
    })
    .returning(categoryColumns);

  return created!;
};
