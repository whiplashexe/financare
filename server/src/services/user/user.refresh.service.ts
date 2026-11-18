import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { refreshTokens } from "../../db/schema/refresh.tokens.js";
import { users } from "../../db/schema/users.js";
import { AUTH_MESSAGE } from "../../constants/response.message.js";
import { ApiError } from "../../utils/api.error.util.js";
import { issueRefreshToken } from "../../utils/auth.session.util.js";
import { hashToken, signAccessToken } from "../../utils/token.util.js";
import { RefreshInput } from "../../validations/user.validation.js";

export const refresh = async ({ input }: { input: RefreshInput }) => {
  const tokenHash = hashToken(input.refresh_token);

  const outcome = await db.transaction(async (tx) => {
    const [current] = await tx
      .select({
        id: refreshTokens.id,
        userId: refreshTokens.userId,
        familyId: refreshTokens.familyId,
        deviceInfo: refreshTokens.deviceInfo,
        revoked: sql<boolean>`${refreshTokens.revokedAt} is not null`,
        expired: sql<boolean>`${refreshTokens.expiresAt} <= now()`,
      })
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, tokenHash))
      .for("update");

    if (!current) return { kind: "invalid" } as const;

    const revokeFamily = () =>
      tx
        .update(refreshTokens)
        .set({ revokedAt: sql`now()` })
        .where(
          and(
            eq(refreshTokens.familyId, current.familyId),
            isNull(refreshTokens.revokedAt),
          ),
        );

    if (current.revoked) {
      await revokeFamily();
      return { kind: "reused" } as const;
    }

    if (current.expired) return { kind: "expired" } as const;

    const [owner] = await tx
      .select({ deletedAt: users.deletedAt })
      .from(users)
      .where(eq(users.id, current.userId));

    if (!owner || owner.deletedAt) {
      await revokeFamily();
      return { kind: "invalid" } as const;
    }

    const next = await issueRefreshToken({
      executor: tx,
      userId: current.userId,
      familyId: current.familyId,
      deviceInfo: current.deviceInfo ?? undefined,
    });

    await tx
      .update(refreshTokens)
      .set({ revokedAt: sql`now()`, replacedBy: next.id })
      .where(eq(refreshTokens.id, current.id));

    return {
      kind: "ok",
      userId: current.userId,
      familyId: current.familyId,
      refreshToken: next.raw,
    } as const;
  });

  if (outcome.kind === "expired") {
    throw ApiError.unauthorized(AUTH_MESSAGE.TOKEN_EXPIRED, "TOKEN_EXPIRED");
  }
  if (outcome.kind !== "ok") {
    throw ApiError.unauthorized(AUTH_MESSAGE.TOKEN_REFRESHED_INVALID);
  }

  const accessToken = await signAccessToken(outcome.userId, outcome.familyId);
  return { accessToken, refreshToken: outcome.refreshToken };
};
