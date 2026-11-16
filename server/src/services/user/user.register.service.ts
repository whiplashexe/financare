import { sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { users } from "../../db/schema/users.js";
import { RegisterInput } from "../../validations/user.validation.js";
import { ApiError } from "../../utils/api.error.util.js";
import { AUTH_MESSAGE } from "../../constants/response.message.js";
import {
  generateRefreshToken,
  newFamilyId,
  REFRESH_TTL_MS,
  signAccessToken,
} from "../../utils/toke.util.js";
import { createDefaultCategories } from "../../db/seeds/create.default.categories.js";
import { refreshTokens } from "../../db/schema/refresh.tokens.js";

export const register = async ({
  input,
  deviceInfo,
}: {
  input: RegisterInput;
  deviceInfo?: string;
}) => {
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.email}) = ${input.email}`)
    .limit(1);

  if (existing.length > 0)
    throw ApiError.conflict(AUTH_MESSAGE.EMAIL_ALREADY_EXISTS);

  const passwordHash = await Bun.password.hash(input.password, {
    algorithm: "argon2id",
  });

  const refresh = generateRefreshToken();
  const user = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(users)
      .values({
        name: input.name,
        email: input.email,
        passwordHash,
      })
      .returning({
        id: users.id,
        name: users.name,
        email: users.email,
        timezone: users.timezone,
        hideBalance: users.hideBalance,
        createdAt: users.createdAt,
      });

    await createDefaultCategories(tx, created!.id);

    await tx.insert(refreshTokens).values({
      userId: created!.id,
      familyId: newFamilyId(),
      tokenHash: refresh.hash,
      deviceInfo: deviceInfo?.slice(0, 255),
      expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
    });
    return created!;
  });

  const accessToken = await signAccessToken(user.id);
  return { user, accessToken, refreshTokens: refresh.raw };
};
