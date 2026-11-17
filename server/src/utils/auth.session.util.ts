import { db } from "../db/index.js";
import { refreshTokens } from "../db/schema/refresh.tokens.js";
import {
  generateRefreshToken,
  newFamilyId,
  REFRESH_TTL_MS,
  signAccessToken,
} from "./token.util.js";

type Executor = Pick<typeof db, "insert">;

type DeviceInput = { platform: string; name?: string | undefined } | undefined;

export const describeDevice = (device: DeviceInput, userAgent?: string) => {
  const fromClient =
    device && [device.platform, device.name].filter(Boolean).join(" ");
  return (fromClient || userAgent)?.slice(0, 255);
};

export const createSession = async ({
  executor = db,
  userId,
  deviceInfo,
}: {
  executor?: Executor;
  userId: string;
  deviceInfo?: string | undefined;
}) => {
  const refresh = generateRefreshToken();

  await executor.insert(refreshTokens).values({
    userId,
    familyId: newFamilyId(),
    tokenHash: refresh.hash,
    deviceInfo,
    expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
  });

  const accessToken = await signAccessToken(userId);
  return { accessToken, refreshToken: refresh.raw };
};
