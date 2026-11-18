import { SignJWT } from "jose";
import { env } from "../config/env.js";
import { createHash, randomBytes, randomUUID } from "node:crypto";

const accessSecret = new TextEncoder().encode(env?.JWT_ACCESS_SECRET);

export const ACCESS_TTL_SECONDS = (env?.ACCESS_TOKEN_TTL_MINUTES ?? 15) * 60;
export const REFRESH_TTL_MS =
  (env?.REFRESH_TOKEN_TTL_DAYS ?? 30) * 24 * 60 * 60 * 1000;

export const signAccessToken = (userId: string, sessionId: string) =>
  new SignJWT({ sid: sessionId })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TTL_SECONDS}s`)
    .sign(accessSecret);

export const PASSWORD_RESET_TTL_MINUTES = 30;

export const generateOpaqueToken = () => {
  const raw = randomBytes(32).toString("base64url");
  return { raw, hash: hashToken(raw) };
};

export const generateRefreshToken = generateOpaqueToken;

export const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");

export const newFamilyId = () => randomUUID();
