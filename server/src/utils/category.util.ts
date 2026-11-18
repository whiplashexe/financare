import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { categories } from "../db/schema/categories.js";
import { CATEGORY_MESSAGE } from "../constants/response.message.js";
import { ApiError } from "./api.error.util.js";

export const categoryColumns = {
  id: categories.id,
  name: categories.name,
  type: categories.type,
  icon: categories.icon,
  isDefault: categories.isDefault,
  isFallback: categories.isFallback,
};

export type CategoryRow = {
  id: string;
  name: string;
  type: "INCOME" | "OUTCOME";
  icon: string | null;
  isDefault: boolean;
  isFallback: boolean;
};

export const toCategoryResponse = (row: CategoryRow) => ({
  id: row.id,
  name: row.name,
  type: row.type,
  icon: row.icon,
  is_default: row.isDefault,
  is_fallback: row.isFallback,
});

export const findOwnedCategory = async (userId: string, categoryId: string) => {
  const [row] = await db
    .select(categoryColumns)
    .from(categories)
    .where(and(eq(categories.id, categoryId), eq(categories.userId, userId)));

  if (!row) throw ApiError.notFound(CATEGORY_MESSAGE.NOT_FOUND);
  return row;
};

export const assertNameAvailable = async ({
  userId,
  type,
  name,
  exceptId,
}: {
  userId: string;
  type: "INCOME" | "OUTCOME";
  name: string;
  exceptId?: string;
}) => {
  const [taken] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(
      and(
        eq(categories.userId, userId),
        eq(categories.type, type),
        sql`lower(${categories.name}) = ${name.toLowerCase()}`,
        exceptId ? ne(categories.id, exceptId) : undefined,
      ),
    )
    .limit(1);

  if (taken) throw ApiError.conflict(CATEGORY_MESSAGE.NAME_EXISTS);
};
