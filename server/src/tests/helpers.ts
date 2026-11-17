import app from "../app.js";
import type { AddressInfo } from "node:net";
import { db } from "../db/index.js";
import { users } from "../db/schema/users.js";
import { eq } from "drizzle-orm";

export const startServer = () => {
  const server = app.listen(0);
  const { port } = server.address() as AddressInfo;

  const base = `http://localhost:${port}/api/v1`;
  const post = ({ path, body }: { path: string; body?: unknown }) =>
    fetch(`${base}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  return { post, close: () => server.close() };
};

export const uniqueEmail = () => `tes-${crypto.randomUUID()}@mail.test`;
export const deleteUser = (email: string) =>
  db.delete(users).where(eq(users.email, email));
