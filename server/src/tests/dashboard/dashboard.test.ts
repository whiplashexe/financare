import { afterAll, describe, expect, it } from "bun:test";
import {
  createUser,
  dayInJakarta,
  deleteUsers,
  insertOneTimePlan,
  insertRecurringPlan,
  startServer,
} from "../helpers.js";

const server = startServer();
const emails: string[] = [];

const newUser = async () => {
  const user = await createUser(server);
  emails.push(user.email);
  return user;
};

type User = Awaited<ReturnType<typeof newUser>>;

const call = (method: string, path: string, user: User | undefined, body?: unknown) =>
  server.request({
    method,
    path,
    body,
    headers: user ? { authorization: `Bearer ${user.accessToken}` } : {},
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

const record = async (user: User, accountId: string, extra: Record<string, unknown> = {}) => {
  const res = await call("POST", "/transactions", user, {
    type: "OUTCOME",
    name: "Spend",
    amount: 1000,
    account_id: accountId,
    ...extra,
  });
  return (await res.json()).data.transaction as Record<string, any>;
};

const dashboard = async (user: User) => {
  const res = await call("GET", "/dashboard", user);
  return { status: res.status, json: await res.json() };
};

const data = async (user: User) => (await dashboard(user)).json.data as Record<string, any>;

const month = dayInJakarta(0).slice(0, 7);
const monthStart = `${month}-01T00:00:00+07:00`;
const lastMonth = (() => {
  const d = new Date(`${month}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toISOString().slice(0, 7);
})();

afterAll(async () => {
  try {
    await deleteUsers(emails);
  } finally {
    server.close();
  }
});

describe("GET /dashboard: an empty user", () => {
  it("200 with zeros and empty lists", async () => {
    const user = await newUser();

    const { status, json } = await dashboard(user);

    expect(status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data).toEqual({
      total_balance: 0,
      accounts: [],
      month_summary: { month, income: 0, outcome: 0, net: 0 },
      recent_transactions: [],
      upcoming_reminders: [],
      action_needed: [],
    });
  });

  it("401 without a token", async () => {
    expect((await call("GET", "/dashboard", undefined)).status).toBe(401);
  });
});

describe("GET /dashboard: balances", () => {
  it("lists the active accounts and totals only those included in the total", async () => {
    const user = await newUser();
    const main = await createAccount(user, { name: "Main", initial_balance: 1_000_000 });
    const side = await createAccount(user, { name: "Side", type: "CASH", initial_balance: 500_000, include_in_total: false });
    const archived = await createAccount(user, { initial_balance: 9_000_000 });
    await call("POST", `/accounts/${archived.id}/archive`, user);

    const json = await data(user);

    expect(json.total_balance).toBe(1_000_000);
    expect(json.accounts).toEqual([
      { id: main.id, name: "Main", type: "BANK", current_balance: 1_000_000, include_in_total: true },
      { id: side.id, name: "Side", type: "CASH", current_balance: 500_000, include_in_total: false },
    ]);
  });

  it("follows the transactions and matches GET /accounts", async () => {
    const user = await newUser();
    const account = await createAccount(user, { initial_balance: 1_000_000 });
    await record(user, account.id, { amount: 250_000 });
    await record(user, account.id, { type: "INCOME", amount: 50_000 });

    const json = await data(user);
    const accountsTotal = (await (await call("GET", "/accounts", user)).json()).data.total_balance;

    expect(json.total_balance).toBe(800_000);
    expect(json.total_balance).toBe(accountsTotal);
    expect(json.accounts[0].current_balance).toBe(800_000);
  });

  it("still reports balances when the user hides them: hiding is done by the client", async () => {
    const user = await newUser();
    await createAccount(user, { initial_balance: 123_000 });
    await call("PATCH", "/me/preferences", user, { hide_balance: true });

    const json = await data(user);

    expect(json.total_balance).toBe(123_000);
  });
});

describe("GET /dashboard: month summary", () => {
  it("sums this month's income and outcome, leaving out transfers", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const other = await createAccount(user);
    await record(user, account.id, { type: "INCOME", amount: 8_000_000 });
    await record(user, account.id, { amount: 3_000_000 });
    await record(user, account.id, { amount: 1_200_000 });
    await record(user, account.id, {
      type: "TRANSFER",
      amount: 700_000,
      to_account_id: other.id,
    });

    const json = await data(user);

    expect(json.month_summary).toEqual({
      month,
      income: 8_000_000,
      outcome: 4_200_000,
      net: 3_800_000,
    });
  });

  it("counts a transfer's admin fee as outcome", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const other = await createAccount(user);
    await record(user, account.id, {
      type: "TRANSFER",
      amount: 100_000,
      admin_fee: 2500,
      to_account_id: other.id,
    });

    const json = await data(user);

    expect(json.month_summary).toMatchObject({ income: 0, outcome: 2500, net: -2500 });
  });

  it("leaves out the trash and other months", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    await record(user, account.id, { amount: 1000 });
    const trashed = await record(user, account.id, { amount: 5000 });
    await call("DELETE", `/transactions/${trashed.id}`, user);
    await record(user, account.id, { amount: 9000, date: `${lastMonth}-15T05:00:00Z` });
    await record(user, account.id, { type: "INCOME", amount: 7000, date: `${lastMonth}-15T05:00:00Z` });

    const json = await data(user);

    expect(json.month_summary).toMatchObject({ income: 0, outcome: 1000 });
  });

  it("the month starts at midnight in the user's timezone", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    await record(user, account.id, { amount: 1000, date: monthStart });
    await record(user, account.id, { amount: 100_000, date: "2000-01-01T00:00:00Z" });
    const justBefore = new Date(new Date(monthStart).getTime() - 1000).toISOString();
    await record(user, account.id, { amount: 20_000, date: justBefore });

    const json = await data(user);

    expect(json.month_summary.outcome).toBe(1000);
  });

  it("follows the user's timezone: the month and what belongs to it are decided there", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const instant = new Date(`${month}-01T00:01:00+07:00`);
    await record(user, account.id, { amount: 4000, date: instant.toISOString() });

    const monthIn = (date: Date, timeZone: string) =>
      new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit" })
        .format(date)
        .slice(0, 7);

    for (const timezone of ["Asia/Jakarta", "Pacific/Pago_Pago", "Pacific/Kiritimati", "UTC"]) {
      await call("PATCH", "/me", user, { timezone });

      const json = await data(user);
      const currentMonth = monthIn(new Date(), timezone);

      expect(json.month_summary.month).toBe(currentMonth);
      expect(json.month_summary.outcome).toBe(monthIn(instant, timezone) === currentMonth ? 4000 : 0);
    }
  });
});

describe("GET /dashboard: recent transactions", () => {
  it("returns the five newest by date, newest first, as compact objects", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const ids: string[] = [];
    for (let i = 1; i <= 7; i++) {
      const t = await record(user, account.id, {
        name: `T${i}`,
        date: `${lastMonth}-${String(10 + i).padStart(2, "0")}T05:00:00Z`,
      });
      ids.push(t.id);
    }

    const json = await data(user);

    expect(json.recent_transactions.map((t: any) => t.id)).toEqual([
      ids[6], ids[5], ids[4], ids[3], ids[2],
    ]);
    expect(json.recent_transactions[0]).toMatchObject({
      name: "T7",
      type: "OUTCOME",
      images_count: 0,
      items_count: 0,
      thumbnail_url: null,
    });
    expect(json.recent_transactions[0].items).toBeUndefined();
  });

  it("leaves out the trash", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const kept = await record(user, account.id);
    const trashed = await record(user, account.id);
    await call("DELETE", `/transactions/${trashed.id}`, user);

    const json = await data(user);

    expect(json.recent_transactions.map((t: any) => t.id)).toEqual([kept.id]);
  });
});

describe("GET /dashboard: upcoming reminders", () => {
  it("lists the plans due in the next 7 days, today included, soonest first", async () => {
    const user = await newUser();
    const account = await createAccount(user, { initial_balance: 100_000 });
    const make = (name: string, daysAhead: number, extra: Record<string, unknown> = {}) =>
      insertRecurringPlan({
        userId: user.userId,
        accountId: account.id,
        name,
        amount: 50_000,
        startDate: dayInJakarta(-30),
        nextDueDate: dayInJakarta(daysAhead),
        ...extra,
      });
    const today = await make("Today", 0);
    const edge = await make("Edge", 7);
    await make("Too far", 8);
    await make("Paused", 2, { status: "PAUSED" });
    await make("Ended", 2, { status: "ENDED" });
    const soon = await make("Soon", 3);

    const json = await data(user);

    expect(json.upcoming_reminders.map((r: any) => r.plan_id)).toEqual([today, soon, edge]);
    expect(json.upcoming_reminders[0]).toEqual({
      plan_type: "RECURRING",
      plan_id: today,
      name: "Today",
      due: dayInJakarta(0),
      type: "OUTCOME",
      amount: 50_000,
      funding: { available: 100_000, shortfall: 0, sufficient: true },
    });
  });

  it("a recurring outcome reports whether its account can pay it; an income has no funding", async () => {
    const user = await newUser();
    const account = await createAccount(user, { initial_balance: 20_000 });
    const rent = await insertRecurringPlan({
      userId: user.userId,
      accountId: account.id,
      name: "Rent",
      amount: 50_000,
      startDate: dayInJakarta(-30),
      nextDueDate: dayInJakarta(2),
    });
    const salary = await insertRecurringPlan({
      userId: user.userId,
      accountId: account.id,
      name: "Salary",
      type: "INCOME",
      amount: 5_000_000,
      startDate: dayInJakarta(-30),
      nextDueDate: dayInJakarta(3),
    });

    const json = await data(user);
    const byId = Object.fromEntries(json.upcoming_reminders.map((r: any) => [r.plan_id, r]));

    expect(byId[rent].funding).toEqual({ available: 20_000, shortfall: 30_000, sufficient: false });
    expect(byId[salary].funding).toBeNull();
    expect(byId[salary].type).toBe("INCOME");
  });

  it("one-time plans carry their funding status; done, cancelled, missed and far ones are not listed", async () => {
    const user = await newUser();
    const account = await createAccount(user, { initial_balance: 1_200_000 });
    const planned = await insertOneTimePlan({
      userId: user.userId,
      name: "Black Friday Shopping",
      date: dayInJakarta(5),
      targetAmount: 1_500_000,
    });
    await insertOneTimePlan({ userId: user.userId, date: dayInJakarta(9) });
    await insertOneTimePlan({ userId: user.userId, date: dayInJakarta(3), status: "DONE" });
    await insertOneTimePlan({ userId: user.userId, date: dayInJakarta(3), status: "CANCELLED" });
    await insertOneTimePlan({ userId: user.userId, date: dayInJakarta(-2), status: "MISSED" });
    expect(account.id).toBeString();

    const json = await data(user);

    expect(json.upcoming_reminders).toEqual([
      {
        plan_type: "ONE_TIME",
        plan_id: planned,
        name: "Black Friday Shopping",
        due: dayInJakarta(5),
        type: "OUTCOME",
        amount: 1_500_000,
        funding: { available: 1_200_000, shortfall: 300_000, sufficient: false },
      },
    ]);
  });

  it("mixes both kinds in date order, then by name", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const recurring = await insertRecurringPlan({
      userId: user.userId,
      accountId: account.id,
      name: "B recurring",
      startDate: dayInJakarta(-30),
      nextDueDate: dayInJakarta(4),
    });
    const oneTimeSameDay = await insertOneTimePlan({ userId: user.userId, name: "A one-time", date: dayInJakarta(4) });
    const earlier = await insertOneTimePlan({ userId: user.userId, name: "Z earlier", date: dayInJakarta(1) });

    const json = await data(user);

    expect(json.upcoming_reminders.map((r: any) => r.plan_id)).toEqual([earlier, oneTimeSameDay, recurring]);
  });
});

describe("GET /dashboard: action needed", () => {
  it("lists manual recurring plans that are due or overdue, not automatic ones or future ones", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const base = { userId: user.userId, accountId: account.id, startDate: dayInJakarta(-30) };
    const dueToday = await insertRecurringPlan({ ...base, name: "Due today", nextDueDate: dayInJakarta(0) });
    const overdue = await insertRecurringPlan({ ...base, name: "Overdue", nextDueDate: dayInJakarta(-3) });
    await insertRecurringPlan({ ...base, name: "Automatic", nextDueDate: dayInJakarta(0), autoRecord: true });
    await insertRecurringPlan({ ...base, name: "Tomorrow", nextDueDate: dayInJakarta(1) });
    await insertRecurringPlan({ ...base, name: "Paused", nextDueDate: dayInJakarta(-1), status: "PAUSED" });

    const json = await data(user);

    expect(json.action_needed).toEqual([
      { kind: "RECURRING_DUE", plan_type: "RECURRING", plan_id: overdue, name: "Overdue", due: dayInJakarta(-3) },
      { kind: "RECURRING_DUE", plan_type: "RECURRING", plan_id: dueToday, name: "Due today", due: dayInJakarta(0) },
    ]);
  });

  it("lists missed one-time plans and plans whose account was archived", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const missed = await insertOneTimePlan({ userId: user.userId, name: "Missed", date: dayInJakarta(-2), status: "MISSED" });
    await insertOneTimePlan({ userId: user.userId, date: dayInJakarta(-2), status: "DONE" });
    const needsAccount = await insertRecurringPlan({
      userId: user.userId,
      accountId: account.id,
      name: "Gym",
      startDate: dayInJakarta(-30),
      nextDueDate: dayInJakarta(10),
    });
    await call("POST", `/accounts/${account.id}/archive`, user);

    const json = await data(user);

    expect(json.action_needed).toEqual(
      expect.arrayContaining([
        { kind: "ONE_TIME_MISSED", plan_type: "ONE_TIME", plan_id: missed, name: "Missed", due: dayInJakarta(-2) },
        { kind: "ACCOUNT_CHANGE_NEEDED", plan_type: "RECURRING", plan_id: needsAccount, name: "Gym", due: dayInJakarta(10) },
      ]),
    );
    expect(json.action_needed).toHaveLength(2);
  });

  it("an item leaves the list once the user acts on it", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const today = dayInJakarta(0);
    const created = await call("POST", "/recurring-plans", user, {
      name: "Gym",
      type: "OUTCOME",
      amount: 350_000,
      account_id: account.id,
      frequency: "MONTHLY",
      start_date: today,
      reminder_offsets: [0],
    });
    const plan = (await created.json()).data;
    expect((await data(user)).action_needed.map((a: any) => a.plan_id)).toEqual([plan.id]);

    await call("POST", `/recurring-plans/${plan.id}/occurrences/${today}/confirm`, user, {});

    expect((await data(user)).action_needed).toEqual([]);
  });
});

describe("GET /dashboard: isolation", () => {
  it("shows only the caller's data", async () => {
    const owner = await newUser();
    const other = await newUser();
    const account = await createAccount(owner, { initial_balance: 777_000 });
    await record(owner, account.id, { amount: 1000 });
    await insertOneTimePlan({ userId: owner.userId, date: dayInJakarta(2) });

    const json = await data(other);

    expect(json).toEqual({
      total_balance: 0,
      accounts: [],
      month_summary: { month, income: 0, outcome: 0, net: 0 },
      recent_transactions: [],
      upcoming_reminders: [],
      action_needed: [],
    });
  });
});
