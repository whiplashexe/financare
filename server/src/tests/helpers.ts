import app from "../app.js";
import type { AddressInfo } from "node:net";
import { db } from "../db/index.js";
import { users } from "../db/schema/users.js";
import { rateLimits } from "../db/schema/rate.limits.js";
import { refreshTokens } from "../db/schema/refresh.tokens.js";
import { passwordResetTokens } from "../db/schema/password.reset.tokens.js";
import { accounts } from "../db/schema/accounts.js";
import { transactions } from "../db/schema/transactions.js";
import { recurringPlans } from "../db/schema/recurring.plans.js";
import { oneTimePlans } from "../db/schema/one.time.plans.js";
import { transactionTemplates } from "../db/schema/transaction.templates.js";
import { generateOpaqueToken } from "../utils/token.util.js";
import { eq, inArray, like } from "drizzle-orm";

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
export const deleteUsers = async (emails: string[]) => {
  if (emails.length === 0) return;

  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(inArray(users.email, emails));
  const ids = rows.map((row) => row.id);

  if (ids.length > 0) {
    await db.delete(transactions).where(inArray(transactions.userId, ids));
    await db.delete(recurringPlans).where(inArray(recurringPlans.userId, ids));
    await db.delete(accounts).where(inArray(accounts.userId, ids));
  }

  await db.delete(users).where(inArray(users.email, emails));
};

export const deleteUser = (email: string) => deleteUsers([email]);

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

export const insertTransaction = async (options: {
  userId: string;
  accountId: string;
  toAccountId?: string;
  type: "INCOME" | "OUTCOME" | "TRANSFER";
  amount: number;
  deleted?: boolean;
  categoryId?: string;
}) => {
  await db.insert(transactions).values({
    userId: options.userId,
    accountId: options.accountId,
    toAccountId: options.toAccountId ?? null,
    categoryId: options.categoryId ?? null,
    type: options.type,
    name: "Test transaction",
    amount: options.amount,
    deletedAt: options.deleted ? new Date() : null,
  });
};

export const insertTemplate = async (options: {
  userId: string;
  accountId?: string;
  toAccountId?: string;
  categoryId?: string;
}) => {
  const [row] = await db
    .insert(transactionTemplates)
    .values({
      userId: options.userId,
      name: `template-${crypto.randomUUID()}`,
      type: options.toAccountId ? "TRANSFER" : "OUTCOME",
      transactionName: "Test template",
      accountId: options.accountId ?? null,
      toAccountId: options.toAccountId ?? null,
      categoryId: options.categoryId ?? null,
    })
    .returning({ id: transactionTemplates.id });
  return row!.id;
};

export const insertRecurringPlan = async (options: {
  userId: string;
  accountId: string;
  categoryId?: string;
  name?: string;
  type?: "INCOME" | "OUTCOME";
  amount?: number;
  frequency?: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
  startDate?: string;
  endDate?: string | null;
  nextDueDate?: string;
  status?: "ACTIVE" | "PAUSED" | "ENDED";
  autoRecord?: boolean;
  reminderOffsets?: number[];
}) => {
  const startDate = options.startDate ?? "2026-01-01";
  const [row] = await db
    .insert(recurringPlans)
    .values({
      userId: options.userId,
      accountId: options.accountId,
      categoryId: options.categoryId ?? null,
      name: options.name ?? "Test plan",
      type: options.type ?? "OUTCOME",
      amount: options.amount ?? 1000,
      frequency: options.frequency ?? "MONTHLY",
      startDate,
      endDate: options.endDate ?? null,
      nextDueDate: options.nextDueDate ?? "2026-02-01",
      status: options.status ?? "ACTIVE",
      autoRecord: options.autoRecord ?? false,
      reminderOffsets: options.reminderOffsets ?? [0],
    })
    .returning({ id: recurringPlans.id });
  return row!.id;
};

export const planRow = async (id: string) => {
  const [row] = await db
    .select()
    .from(recurringPlans)
    .where(eq(recurringPlans.id, id));
  return row!;
};

export const transactionRows = (userId: string) =>
  db.select().from(transactions).where(eq(transactions.userId, userId));

export const templateRow = async (id: string) => {
  const [row] = await db
    .select()
    .from(transactionTemplates)
    .where(eq(transactionTemplates.id, id));
  return row!;
};

export const dayInJakarta = (offsetDays = 0) =>
  new Date(Date.now() + 7 * 60 * 60 * 1000 + offsetDays * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

export const insertOneTimePlan = async (options: {
  userId: string;
  date: string;
  sourceAccountId?: string;
  name?: string;
  targetAmount?: number;
  status?: "PLANNED" | "DONE" | "MISSED" | "CANCELLED";
  reminderOffsets?: number[];
}) => {
  const [row] = await db
    .insert(oneTimePlans)
    .values({
      userId: options.userId,
      sourceAccountId: options.sourceAccountId ?? null,
      name: options.name ?? "Test plan",
      date: options.date,
      targetAmount: options.targetAmount ?? 1000,
      status: options.status ?? "PLANNED",
      reminderOffsets: options.reminderOffsets ?? [1],
    })
    .returning({ id: oneTimePlans.id });
  return row!.id;
};

export const oneTimeRow = async (id: string) => {
  const [row] = await db
    .select()
    .from(oneTimePlans)
    .where(eq(oneTimePlans.id, id));
  return row!;
};
