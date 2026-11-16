import { db } from "./db/index.js";
import { users } from "./db/schema/users.js";
import { createDefaultCategories } from "./db/seeds/create.default.categories.js";

try {
  await db.transaction(async (tx) => {
    const [u] = await tx
      .insert(users)
      .values({ name: "Uji", email: "uji@example.com", passwordHash: "x" })
      .returning();

    await createDefaultCategories(tx, u!.id);
    await createDefaultCategories(tx, u!.id);

    const rows = await tx.query.categories.findMany({
      where: { userId: u!.id },
      orderBy: { type: "asc" },
    });
    console.table(
      rows.map((r) => ({
        id: r.id,
        name: r.name,
        type: r.type,
        fallback: r.isFallback,
      })),
    );

    throw new Error("ROLLBACK");
  });
} catch (e) {
  if ((e as Error).message !== "ROLLBACK") throw e;
}
process.exit(0);
