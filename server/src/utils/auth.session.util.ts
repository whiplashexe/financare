import { db } from "../db/index.js";
import { refreshTokens } from "../db/schema/refresh.tokens.js";
import {
  ACCESS_TTL_SECONDS,
  generateRefreshToken,
  newFamilyId,
  REFRESH_TTL_MS,
  signAccessToken,
} from "./token.util.js";

type Executor = Pick<typeof db, "insert">;
type SessionUser = {
  id: string;
  name: string;
  email: string;
  timezone: string;
};

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

export const toAuthResponse = (result: {
  user: SessionUser;
  accessToken: string;
  refreshToken: string;
}) => ({
  user: {
    id: result.user.id,
    name: result.user.name,
    email: result.user.email,
    timezone: result.user.timezone,
  },
  access_token: result.accessToken,
  access_expires_in: ACCESS_TTL_SECONDS,
  refresh_token: result.refreshToken,
});
