import { db } from "../index.js";
import { categories } from "../schema/categories.js";
import { DEFAULT_CATEGORIES } from "./default.categories.js";

type Executor = Pick<typeof db, "insert">;
export const createDefaultCategories = async (
  executor: Executor,
  userId: string,
) => {
  await executor
    .insert(categories)
    .values(
      DEFAULT_CATEGORIES.map((c) => ({
        userId,
        name: c.name,
        type: c.type,
        icon: c.icon,
        isDefault: true,
        isFallback: c.isFallback,
      })),
    )
    .onConflictDoNothing();
};
