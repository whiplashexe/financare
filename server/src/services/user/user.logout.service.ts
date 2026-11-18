import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { refreshTokens } from "../../db/schema/refresh.tokens.js";
import { hashToken } from "../../utils/token.util.js";
import { LogoutInput } from "../../validations/user.validation.js";

export const logout = async ({ input }: { input: LogoutInput }) => {
  const family = db
    .select({ familyId: refreshTokens.familyId })
    .from(refreshTokens)
    .where(eq(refreshTokens.tokenHash, hashToken(input.refresh_token)));

  await db
    .update(refreshTokens)
    .set({ revokedAt: sql`now()` })
    .where(
      and(inArray(refreshTokens.familyId, family), isNull(refreshTokens.revokedAt)),
    );
};
