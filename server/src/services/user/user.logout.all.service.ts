import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { refreshTokens } from "../../db/schema/refresh.tokens.js";

export const logoutAll = async ({ userId }: { userId: string }) => {
  await db
    .update(refreshTokens)
    .set({ revokedAt: sql`now()` })
    .where(
      and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)),
    );
};
