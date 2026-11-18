import { and, eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { categories } from "../../db/schema/categories.js";
import { CATEGORY_MESSAGE } from "../../constants/response.message.js";
import { ApiError } from "../../utils/api.error.util.js";
import {
  assertNameAvailable,
  categoryColumns,
  findOwnedCategory,
} from "../../utils/category.util.js";
import { UpdateCategoryInput } from "../../validations/category.validation.js";

export const updateCategory = async ({
  userId,
  categoryId,
  input,
}: {
  userId: string;
  categoryId: string;
  input: UpdateCategoryInput;
}) => {
  const current = await findOwnedCategory(userId, categoryId);

  if (
    current.isFallback &&
    input.name !== undefined &&
    input.name !== current.name
  ) {
    throw ApiError.businessRule(CATEGORY_MESSAGE.FALLBACK_PROTECTED);
  }

  if (input.name !== undefined && input.name !== current.name) {
    await assertNameAvailable({
      userId,
      type: current.type,
      name: input.name,
      exceptId: categoryId,
    });
  }

  const [updated] = await db
    .update(categories)
    .set({
      ...(input.name !== undefined && { name: input.name }),
      ...(input.icon !== undefined && { icon: input.icon }),
    })
    .where(and(eq(categories.id, categoryId), eq(categories.userId, userId)))
    .returning(categoryColumns);

  return updated!;
};
