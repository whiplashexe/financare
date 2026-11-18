import app from "../app.js";
import type { AddressInfo } from "node:net";
import { db } from "../db/index.js";
import { users } from "../db/schema/users.js";
import { rateLimits } from "../db/schema/rate.limits.js";
import { refreshTokens } from "../db/schema/refresh.tokens.js";
import { passwordResetTokens } from "../db/schema/password.reset.tokens.js";
import { generateOpaqueToken } from "../utils/token.util.js";
import { eq, like } from "drizzle-orm";

const octet = () => Math.floor(Math.random() * 254) + 1;

export const randomIp = () => `10.${octet()}.${octet()}.${octet()}`;

export const startServer = () => {
  const server = app.listen(0);
  const { port } = server.address() as AddressInfo;

  const base = `http://localhost:${port}/api/v1`;
  const request = ({
    method = "POST",
    path,
    body,
    ip = randomIp(),
    headers = {},
  }: {
    method?: string;
    path: string;
    body?: unknown;
    ip?: string;
    headers?: Record<string, string>;
  }) =>
    fetch(`${base}${path}`, {
      method,
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": ip,
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  const post = (options: Parameters<typeof request>[0]) =>
    request({ ...options, method: "POST" });

  return { post, request, close: () => server.close() };
};

export const uniqueEmail = () => `test-${crypto.randomUUID()}@mail.test`;
export const deleteUser = (email: string) =>
  db.delete(users).where(eq(users.email, email));

export const deleteRateLimit = (key: string) =>
  db.delete(rateLimits).where(eq(rateLimits.key, key));
export const deleteRateLimitsLike = (pattern: string) =>
  db.delete(rateLimits).where(like(rateLimits.key, pattern));

export type TestServer = ReturnType<typeof startServer>;

export const createUser = async (server: TestServer) => {
  const email = uniqueEmail();
  const password = "secret123";
  const res = await server.post({
    path: "/auth/register",
    body: { name: "Test", email, password },
  });
  const json = await res.json();
  return {
    email,
    password,
    userId: json.data.user.id as string,
    accessToken: json.data.access_token as string,
    refreshToken: json.data.refresh_token as string,
  };
};

export const refreshRows = (userId: string) =>
  db.select().from(refreshTokens).where(eq(refreshTokens.userId, userId));

export const resetRows = (userId: string) =>
  db
    .select()
    .from(passwordResetTokens)
    .where(eq(passwordResetTokens.userId, userId));

export const insertResetToken = async (
  userId: string,
  options: { expired?: boolean; used?: boolean } = {},
) => {
  const token = generateOpaqueToken();
  await db.insert(passwordResetTokens).values({
    userId,
    tokenHash: token.hash,
    expiresAt: new Date(Date.now() + (options.expired ? -60_000 : 600_000)),
    usedAt: options.used ? new Date() : null,
  });
  return token.raw;
};
