import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { planOccurrences } from "../../db/schema/plan.occurrences.js";
import { users } from "../../db/schema/users.js";
import RecurringService from "../../services/recurring/index.js";
import {
  createUser,
  dayInJakarta,
  deleteUsers,
  insertRecurringPlan,
  planRow,
  startServer,
  transactionRows,
} from "../helpers.js";

const server = startServer();
const emails: string[] = [];
const SECRET = "test-cron-secret-0123456789";

const newUser = async () => {
  const user = await createUser(server);
  emails.push(user.email);
  return user;
};

type User = Awaited<ReturnType<typeof newUser>>;

const call = (
  method: string,
  path: string,
  user: User | undefined,
  body?: unknown,
  headers: Record<string, string> = {},
) =>
  server.request({
    method,
    path,
    body,
    headers: {
      ...(user ? { authorization: `Bearer ${user.accessToken}` } : {}),
      ...headers,
    },
  });

const createAccount = async (user: User, body: Record<string, unknown> = {}) => {
  const res = await call("POST", "/accounts", user, {
    name: `Account ${crypto.randomUUID().slice(0, 8)}`,
    type: "BANK",
    initial_balance: 1_000_000,
    ...body,
  });
  return (await res.json()).data as Record<string, any>;
};

const occurrencesOf = (planId: string) =>
  db.select().from(planOccurrences).where(eq(planOccurrences.recurringPlanId, planId));

const resultFor = (run: Awaited<ReturnType<typeof RecurringService.autoRecord>>, planId: string) =>
  run.plans.find((p) => p.planId === planId);

const balanceOf = async (user: User, accountId: string) =>
  (await (await call("GET", `/accounts/${accountId}`, user)).json()).data.current_balance as number;

const previousSecret = process.env.CRON_SECRET;

beforeAll(() => {
  process.env.CRON_SECRET = SECRET;
});

afterAll(async () => {
  if (previousSecret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = previousSecret;
  try {
    await deleteUsers(emails);
  } finally {
    server.close();
  }
});

describe("auto-record", () => {
  it("records a plan that is due today as an automatic transaction and advances it", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const planId = await insertRecurringPlan({
      userId: user.userId,
      accountId: account.id,
      name: "Netflix",
      amount: 120_000,
      frequency: "MONTHLY",
      startDate: dayInJakarta(0),
      nextDueDate: dayInJakarta(0),
      autoRecord: true,
    });

    const run = await RecurringService.autoRecord();

    expect(resultFor(run, planId)).toEqual({ planId, recorded: 1 });
    const rows = await transactionRows(user.userId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      name: "Netflix",
      amount: 120_000,
      type: "OUTCOME",
      source: "AUTO",
      recurringPlanId: planId,
    });
    expect(rows[0]!.date.toISOString()).toBe(`${new Date(`${dayInJakarta(0)}T00:00:00+07:00`).toISOString()}`);
    expect(await balanceOf(user, account.id)).toBe(880_000);

    const occurrences = await occurrencesOf(planId);
    expect(occurrences).toHaveLength(1);
    expect(occurrences[0]).toMatchObject({
      dueDate: dayInJakarta(0),
      outcome: "AUTO_RECORDED",
      transactionId: rows[0]!.id,
    });
    const plan = await planRow(planId);
    expect(plan.nextDueDate > dayInJakarta(0)).toBe(true);
    expect(plan.status).toBe("ACTIVE");
  });

  it("an automatic income increases the balance", async () => {
    const user = await newUser();
    const account = await createAccount(user, { initial_balance: 0 });
    await insertRecurringPlan({
      userId: user.userId,
      accountId: account.id,
      type: "INCOME",
      amount: 5_000_000,
      startDate: dayInJakarta(0),
      nextDueDate: dayInJakarta(0),
      autoRecord: true,
    });

    await RecurringService.autoRecord();

    expect(await balanceOf(user, account.id)).toBe(5_000_000);
  });

  it("catches up on every period missed while the job did not run", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const planId = await insertRecurringPlan({
      userId: user.userId,
      accountId: account.id,
      amount: 10_000,
      frequency: "DAILY",
      startDate: dayInJakarta(-3),
      nextDueDate: dayInJakarta(-3),
      autoRecord: true,
    });

    const run = await RecurringService.autoRecord();

    expect(resultFor(run, planId)).toEqual({ planId, recorded: 4 });
    const occurrences = await occurrencesOf(planId);
    expect(occurrences.map((o) => o.dueDate).sort()).toEqual([
      dayInJakarta(-3),
      dayInJakarta(-2),
      dayInJakarta(-1),
      dayInJakarta(0),
    ]);
    expect(await balanceOf(user, account.id)).toBe(1_000_000 - 40_000);
    expect((await planRow(planId)).nextDueDate).toBe(dayInJakarta(1));
  });

  it("running again right away records nothing more", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const planId = await insertRecurringPlan({
      userId: user.userId,
      accountId: account.id,
      startDate: dayInJakarta(0),
      nextDueDate: dayInJakarta(0),
      autoRecord: true,
    });

    await RecurringService.autoRecord();
    const second = await RecurringService.autoRecord();

    expect(resultFor(second, planId)).toBeUndefined();
    expect(await transactionRows(user.userId)).toHaveLength(1);
  });

  it("two runs at the same time still record the period once", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    await insertRecurringPlan({
      userId: user.userId,
      accountId: account.id,
      startDate: dayInJakarta(0),
      nextDueDate: dayInJakarta(0),
      autoRecord: true,
    });

    await Promise.all([RecurringService.autoRecord(), RecurringService.autoRecord()]);

    expect(await transactionRows(user.userId)).toHaveLength(1);
  });

  it("does not record a period that already has an occurrence", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const planId = await insertRecurringPlan({
      userId: user.userId,
      accountId: account.id,
      startDate: dayInJakarta(0),
      nextDueDate: dayInJakarta(0),
      autoRecord: true,
    });
    await db.insert(planOccurrences).values({
      recurringPlanId: planId,
      dueDate: dayInJakarta(0),
      outcome: "SKIPPED",
      transactionId: null,
    });

    await RecurringService.autoRecord();

    expect(await transactionRows(user.userId)).toHaveLength(0);
    expect((await planRow(planId)).nextDueDate > dayInJakarta(0)).toBe(true);
  });

  it("ends the plan after recording its last period", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const planId = await insertRecurringPlan({
      userId: user.userId,
      accountId: account.id,
      frequency: "DAILY",
      startDate: dayInJakarta(-5),
      endDate: dayInJakarta(-1),
      nextDueDate: dayInJakarta(-2),
      autoRecord: true,
    });

    const run = await RecurringService.autoRecord();

    expect(resultFor(run, planId)).toEqual({ planId, recorded: 2 });
    const plan = await planRow(planId);
    expect(plan.status).toBe("ENDED");
    expect(plan.nextDueDate).toBe(dayInJakarta(-1));
  });

  it("still records when the balance is not enough", async () => {
    const user = await newUser();
    const account = await createAccount(user, { initial_balance: 1000 });
    await insertRecurringPlan({
      userId: user.userId,
      accountId: account.id,
      amount: 50_000,
      startDate: dayInJakarta(0),
      nextDueDate: dayInJakarta(0),
      autoRecord: true,
    });

    await RecurringService.autoRecord();

    expect(await balanceOf(user, account.id)).toBe(-49_000);
  });

  it("leaves alone plans that are not due, paused, ended, or not automatic", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const base = {
      userId: user.userId,
      accountId: account.id,
      startDate: dayInJakarta(-1),
      nextDueDate: dayInJakarta(0),
    };
    const notDue = await insertRecurringPlan({ ...base, nextDueDate: dayInJakarta(1), autoRecord: true });
    const paused = await insertRecurringPlan({ ...base, status: "PAUSED", autoRecord: true });
    const ended = await insertRecurringPlan({ ...base, status: "ENDED", autoRecord: true });
    const manual = await insertRecurringPlan({ ...base, autoRecord: false });

    const run = await RecurringService.autoRecord();

    for (const id of [notDue, paused, ended, manual]) {
      expect(resultFor(run, id)).toBeUndefined();
    }
    expect(await transactionRows(user.userId)).toHaveLength(0);
  });

  it("does not run for an archived account and leaves the plan as it was", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const planId = await insertRecurringPlan({
      userId: user.userId,
      accountId: account.id,
      startDate: dayInJakarta(0),
      nextDueDate: dayInJakarta(0),
      autoRecord: true,
    });
    await call("POST", `/accounts/${account.id}/archive`, user);

    const run = await RecurringService.autoRecord();

    expect(resultFor(run, planId)).toEqual({ planId, skipped: "ACCOUNT_ARCHIVED" });
    expect(await transactionRows(user.userId)).toHaveLength(0);
    expect((await planRow(planId)).nextDueDate).toBe(dayInJakarta(0));
  });

  it("ignores the plans of a deleted user", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const planId = await insertRecurringPlan({
      userId: user.userId,
      accountId: account.id,
      startDate: dayInJakarta(0),
      nextDueDate: dayInJakarta(0),
      autoRecord: true,
    });
    await db.update(users).set({ deletedAt: new Date() }).where(eq(users.id, user.userId));

    const run = await RecurringService.autoRecord();

    expect(resultFor(run, planId)).toBeUndefined();
    expect(await transactionRows(user.userId)).toHaveLength(0);
  });

  it("uses the user's own timezone to decide what is due today", async () => {
    const user = await newUser();
    await call("PATCH", "/me", user, { timezone: "Pacific/Kiritimati" });
    const account = await createAccount(user);
    const localToday = new Date(Date.now() + 14 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const planId = await insertRecurringPlan({
      userId: user.userId,
      accountId: account.id,
      startDate: localToday,
      nextDueDate: localToday,
      autoRecord: true,
    });

    const run = await RecurringService.autoRecord();

    expect(resultFor(run, planId)).toEqual({ planId, recorded: 1 });
    const [row] = await transactionRows(user.userId);
    expect(row!.date.toISOString()).toBe(new Date(`${localToday}T00:00:00+14:00`).toISOString());
  });

  it("a plan of another user is not affected by this user's data", async () => {
    const first = await newUser();
    const second = await newUser();
    const a = await createAccount(first);
    const b = await createAccount(second);
    await insertRecurringPlan({
      userId: first.userId,
      accountId: a.id,
      startDate: dayInJakarta(0),
      nextDueDate: dayInJakarta(0),
      autoRecord: true,
    });
    const notDue = await insertRecurringPlan({
      userId: second.userId,
      accountId: b.id,
      startDate: dayInJakarta(2),
      nextDueDate: dayInJakarta(2),
      autoRecord: true,
    });

    await RecurringService.autoRecord();

    expect(await transactionRows(first.userId)).toHaveLength(1);
    expect(await transactionRows(second.userId)).toHaveLength(0);
    expect((await planRow(notDue)).nextDueDate).toBe(dayInJakarta(2));
  });
});

describe("GET /internal/cron/recurring-auto-record", () => {
  const trigger = (headers: Record<string, string> = {}) =>
    server.request({ method: "GET", path: "/internal/cron/recurring-auto-record", headers });

  it("401 without the secret, with a wrong one, or with another scheme", async () => {
    expect((await trigger()).status).toBe(401);
    expect((await trigger({ authorization: "Bearer wrong-secret-wrong-secret" })).status).toBe(401);
    expect((await trigger({ authorization: `Bearer ${SECRET}x` })).status).toBe(401);
    expect((await trigger({ authorization: SECRET.slice(0, 5) })).status).toBe(401);
  });

  it("401 when no secret is configured, even if the header is empty", async () => {
    delete process.env.CRON_SECRET;
    try {
      expect((await trigger({ authorization: "Bearer " })).status).toBe(401);
      expect((await trigger({ authorization: "Bearer " + SECRET })).status).toBe(401);
    } finally {
      process.env.CRON_SECRET = SECRET;
    }
  });

  it("401 when the configured secret is too short to be safe", async () => {
    process.env.CRON_SECRET = "short";
    try {
      expect((await trigger({ authorization: "Bearer short" })).status).toBe(401);
    } finally {
      process.env.CRON_SECRET = SECRET;
    }
  });

  it("200 with the secret: runs the job and reports what it recorded", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const planId = await insertRecurringPlan({
      userId: user.userId,
      accountId: account.id,
      startDate: dayInJakarta(0),
      nextDueDate: dayInJakarta(0),
      autoRecord: true,
    });

    const res = await trigger({ authorization: `Bearer ${SECRET}` });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.recorded).toBeGreaterThanOrEqual(1);
    expect(json.data.plans).toContainEqual({ planId, recorded: 1 });
    expect(await transactionRows(user.userId)).toHaveLength(1);
  });
});
