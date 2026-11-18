import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { categories } from "../../db/schema/categories.js";
import { categoryColumns } from "../../utils/category.util.js";
import { ListCategoriesQuery } from "../../validations/category.validation.js";

export const listCategories = async ({
  userId,
  query,
}: {
  userId: string;
  query: ListCategoriesQuery;
}) =>
  db
    .select(categoryColumns)
    .from(categories)
    .where(
      and(
        eq(categories.userId, userId),
        query.type ? eq(categories.type, query.type) : undefined,
      ),
    )
    .orderBy(
      asc(categories.type),
      asc(categories.isFallback),
      asc(categories.createdAt),
      asc(sql`length(${categories.id})`),
      asc(categories.id),
    );
