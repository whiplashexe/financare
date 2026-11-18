import app from "../app.js";
import type { AddressInfo } from "node:net";
import { db } from "../db/index.js";
import { users } from "../db/schema/users.js";
import { rateLimits } from "../db/schema/rate.limits.js";
import { eq, like } from "drizzle-orm";

const octet = () => Math.floor(Math.random() * 254) + 1;

export const randomIp = () => `10.${octet()}.${octet()}.${octet()}`;

export const startServer = () => {
  const server = app.listen(0);
  const { port } = server.address() as AddressInfo;

  const base = `http://localhost:${port}/api/v1`;
  const post = ({
    path,
    body,
    ip = randomIp(),
  }: {
    path: string;
    body?: unknown;
    ip?: string;
  }) =>
    fetch(`${base}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ip },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  return { post, close: () => server.close() };
};

export const uniqueEmail = () => `test-${crypto.randomUUID()}@mail.test`;
export const deleteUser = (email: string) =>
  db.delete(users).where(eq(users.email, email));

export const deleteRateLimit = (key: string) =>
  db.delete(rateLimits).where(eq(rateLimits.key, key));
export const deleteRateLimitsLike = (pattern: string) =>
  db.delete(rateLimits).where(like(rateLimits.key, pattern));
