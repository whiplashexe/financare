import { SignJWT } from "jose";
import { env } from "../config/env.js";
import { createHash, randomBytes, randomUUID } from "node:crypto";

const accessSecret = new TextEncoder().encode(env?.JWT_ACCESS_SECRET);
export const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const signAccessToken = (userId: string) => {
  new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime((env && env.JWT_ACCESS_TTL) || "15m")
    .sign(accessSecret);
};

export const generateRefreshToken = () => {
  const raw = randomBytes(32).toString("base64url");
  return { raw, hash: hashToken(raw) };
};

export const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");

export const newFamilyId = () => randomUUID();
