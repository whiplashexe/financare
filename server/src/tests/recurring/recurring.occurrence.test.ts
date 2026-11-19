import { afterAll, describe, expect, it } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { planOccurrences } from "../../db/schema/plan.occurrences.js";
import {
  createUser,
  dayInJakarta,
  deleteUsers,
  insertRecurringPlan,
  startServer,
  transactionRows,
} from "../helpers.js";

const server = startServer();
const emails: string[] = [];

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

const makePlan = async (user: User, accountId: string, extra: Record<string, unknown> = {}) => {
  const res = await call("POST", "/recurring-plans", user, {
    name: "Gym",
    type: "OUTCOME",
    amount: 350_000,
    account_id: accountId,
    frequency: "WEEKLY",
    start_date: dayInJakarta(1),
    reminder_offsets: [1, 0],
    ...extra,
  });
  return (await res.json()).data as Record<string, any>;
};

const confirm = (
  user: User,
  planId: string,
  dueDate: string,
  body: unknown = {},
  headers?: Record<string, string>,
) => call("POST", `/recurring-plans/${planId}/occurrences/${dueDate}/confirm`, user, body, headers);

const skip = (user: User, planId: string, dueDate: string) =>
  call("POST", `/recurring-plans/${planId}/occurrences/${dueDate}/skip`, user);

const planOf = async (user: User, id: string) =>
  (await (await call("GET", `/recurring-plans/${id}`, user)).json()).data as Record<string, any>;

const balanceOf = async (user: User, accountId: string) =>
  (await (await call("GET", `/accounts/${accountId}`, user)).json()).data.current_balance as number;

const plusDays = (date: string, days: number) => {
  const moved = new Date(`${date}T00:00:00Z`);
  moved.setUTCDate(moved.getUTCDate() + days);
  return moved.toISOString().slice(0, 10);
};

afterAll(async () => {
  try {
    await deleteUsers(emails);
  } finally {
    server.close();
  }
});

describe("POST .../occurrences/:dueDate/confirm", () => {
  it("201: records the transaction from the plan and moves to the next period", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const category = (
      await (await call("GET", "/categories?type=OUTCOME", user)).json()
    ).data.find((c: any) => c.name === "Kesehatan").id;
    const plan = await makePlan(user, account.id, { category_id: category });

    const res = await confirm(user, plan.id, plan.next_due_date);
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.success).toBe(true);
    expect(json.data.next_due_date).toBe(plusDays(plan.next_due_date, 7));
    expect(json.data.account_balance_after).toBe(650_000);
    expect(json.data.warnings).toEqual([]);
    expect(json.data.transaction).toMatchObject({
      id: expect.stringMatching(/^TRANS\d{3,}$/),
      type: "OUTCOME",
      name: "Gym",
      amount: 350_000,
      account_id: account.id,
      category_id: category,
      plan_id: plan.id,
      source: "MANUAL",
    });
    expect((await planOf(user, plan.id)).next_due_date).toBe(plusDays(plan.next_due_date, 7));
  });

  it("the overrides change the transaction but not the plan", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const other = await createAccount(user, { initial_balance: 100_000 });
    const plan = await makePlan(user, account.id);

    const json = await (
      await confirm(user, plan.id, plan.next_due_date, {
        amount: 360_000,
        date: "2026-11-10T05:00:00Z",
        account_id: other.id,
      })
    ).json();

    expect(json.data.transaction).toMatchObject({
      amount: 360_000,
      date: "2026-11-10T05:00:00.000Z",
      account_id: other.id,
      plan_id: plan.id,
    });
    expect(json.data.account_balance_after).toBe(100_000 - 360_000);
    expect(json.data.warnings).toEqual([
      { code: "NEGATIVE_BALANCE", account_id: other.id, balance_after: -260_000 },
    ]);
    const after = await planOf(user, plan.id);
    expect(after).toMatchObject({ amount: 350_000, account_id: account.id });
  });

  it("works without a request body, and the occurrence shows in the plan history", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const plan = await makePlan(user, account.id);

    const res = await confirm(user, plan.id, plan.next_due_date, undefined);

    expect(res.status).toBe(201);
    const detail = await planOf(user, plan.id);
    expect(detail.occurrences).toHaveLength(1);
    expect(detail.occurrences[0]).toMatchObject({ due_date: plan.next_due_date, outcome: "CONFIRMED" });
    expect(detail.transactions).toHaveLength(1);
  });

  it("walks the periods one after the other", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const plan = await makePlan(user, account.id, { frequency: "DAILY" });
    let due = plan.next_due_date;

    for (let i = 0; i < 3; i++) {
      const json = await (await confirm(user, plan.id, due)).json();
      due = json.data.next_due_date;
    }

    expect(due).toBe(plusDays(plan.next_due_date, 3));
    expect(await balanceOf(user, account.id)).toBe(1_000_000 - 3 * 350_000);
  });

  it("keeps the month-end rule across periods: 31 Jan, 28 Feb, 31 Mar", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const planId = await insertRecurringPlan({
      userId: user.userId,
      accountId: account.id,
      frequency: "MONTHLY",
      startDate: "2027-01-31",
      nextDueDate: "2027-01-31",
    });

    const first = await (await confirm(user, planId, "2027-01-31")).json();
    expect(first.data.next_due_date).toBe("2027-02-28");
    const second = await (await confirm(user, planId, "2027-02-28")).json();
    expect(second.data.next_due_date).toBe("2027-03-31");
  });

  it("confirming the last period ends the plan", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const start = dayInJakarta(1);
    const plan = await makePlan(user, account.id, {
      frequency: "DAILY",
      start_date: start,
      end_date: plusDays(start, 1),
    });

    await confirm(user, plan.id, start);
    const last = await (await confirm(user, plan.id, plusDays(start, 1))).json();

    expect(last.data.next_due_date).toBeNull();
    const after = await planOf(user, plan.id);
    expect(after.status).toBe("ENDED");
    expect(after.next_due_date).toBeNull();
  });

  it("409 with the existing transaction when the period was already confirmed", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const plan = await makePlan(user, account.id);
    const first = await (await confirm(user, plan.id, plan.next_due_date)).json();

    const again = await confirm(user, plan.id, plan.next_due_date);
    const json = await again.json();

    expect(again.status).toBe(409);
    expect(json.code).toBe("CONFLICT");
    expect(json.data.outcome).toBe("CONFIRMED");
    expect(json.data.transaction.id).toBe(first.data.transaction.id);
    expect(await transactionRows(user.userId)).toHaveLength(1);
  });

  it("409 for a skipped period, with no transaction", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const plan = await makePlan(user, account.id);
    await skip(user, plan.id, plan.next_due_date);

    const res = await confirm(user, plan.id, plan.next_due_date);
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.data).toEqual({ outcome: "SKIPPED", transaction: null });
    expect(await transactionRows(user.userId)).toHaveLength(0);
  });

  it("422 when the date is not the plan's current due date", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const plan = await makePlan(user, account.id);

    const later = await confirm(user, plan.id, plusDays(plan.next_due_date, 7));
    const earlier = await confirm(user, plan.id, plusDays(plan.next_due_date, -7));
    const between = await confirm(user, plan.id, plusDays(plan.next_due_date, 3));

    for (const res of [later, earlier, between]) {
      expect(res.status).toBe(422);
      expect((await res.json()).code).toBe("BUSINESS_RULE");
    }
    expect(await transactionRows(user.userId)).toHaveLength(0);
  });

  it("400 for a malformed date or invalid overrides", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const plan = await makePlan(user, account.id);
    const due = plan.next_due_date;

    expect((await confirm(user, plan.id, "2026-13-45")).status).toBe(400);
    expect((await confirm(user, plan.id, "tomorrow")).status).toBe(400);
    expect((await confirm(user, plan.id, due, { amount: 0 })).status).toBe(400);
    expect((await confirm(user, plan.id, due, { amount: 1.5 })).status).toBe(400);
    expect((await confirm(user, plan.id, due, { date: "2026-11-13T03:20:00" })).status).toBe(400);
    expect((await confirm(user, plan.id, due, { type: "INCOME" })).status).toBe(400);
    expect((await confirm(user, plan.id, due, { name: "x" })).status).toBe(400);
  });

  it("422 for a future transaction date, and the period stays open", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const plan = await makePlan(user, account.id);
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const res = await confirm(user, plan.id, plan.next_due_date, { date: tomorrow });

    expect(res.status).toBe(422);
    expect((await planOf(user, plan.id)).next_due_date).toBe(plan.next_due_date);
    expect(await db.select().from(planOccurrences)).not.toContainEqual(
      expect.objectContaining({ recurringPlanId: plan.id }),
    );
  });

  it("422 when the plan's account was archived, unless another account is given; the plan is flagged", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const other = await createAccount(user);
    const plan = await makePlan(user, account.id);
    await call("POST", `/accounts/${account.id}/archive`, user);

    expect((await planOf(user, plan.id)).needs_account_change).toBe(true);
    expect((await confirm(user, plan.id, plan.next_due_date)).status).toBe(422);
    expect((await confirm(user, plan.id, plan.next_due_date, { account_id: other.id })).status).toBe(201);
  });

  it("two simultaneous confirmations record one transaction and answer 409 to the other", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const plan = await makePlan(user, account.id);

    const [a, b] = await Promise.all([
      confirm(user, plan.id, plan.next_due_date),
      confirm(user, plan.id, plan.next_due_date),
    ]);

    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect(await transactionRows(user.userId)).toHaveLength(1);
    expect(await balanceOf(user, account.id)).toBe(650_000);
  });

  it("404 for another user's or an unknown plan, and 401 without a token", async () => {
    const owner = await newUser();
    const intruder = await newUser();
    const account = await createAccount(owner);
    const plan = await makePlan(owner, account.id);

    const foreign = await confirm(intruder, plan.id, plan.next_due_date);
    const unknown = await confirm(intruder, "RPLAN999999", plan.next_due_date);

    expect(foreign.status).toBe(404);
    expect(await foreign.json()).toEqual(await unknown.json());
    expect((await confirm(undefined as unknown as User, plan.id, plan.next_due_date)).status).toBe(401);
    expect(await transactionRows(owner.userId)).toHaveLength(0);
  });
});

describe("POST .../occurrences/:dueDate/confirm: Idempotency-Key", () => {
  it("a repeated key replays the first result instead of answering 409", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const plan = await makePlan(user, account.id);
    const key = crypto.randomUUID();

    const first = await confirm(user, plan.id, plan.next_due_date, {}, { "idempotency-key": key });
    const second = await confirm(user, plan.id, plan.next_due_date, {}, { "idempotency-key": key });

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(first.headers.get("idempotent-replayed")).toBeNull();
    expect(second.headers.get("idempotent-replayed")).toBe("true");
    expect((await second.json()).data).toEqual((await first.json()).data);
    expect(await transactionRows(user.userId)).toHaveLength(1);
  });

  it("409 when the key was used for another period or route", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const plan = await makePlan(user, account.id, { frequency: "DAILY" });
    const key = crypto.randomUUID();

    const first = await confirm(user, plan.id, plan.next_due_date, {}, { "idempotency-key": key });
    const nextDue = (await first.json()).data.next_due_date;

    const otherPeriod = await confirm(user, plan.id, nextDue, {}, { "idempotency-key": key });
    expect(otherPeriod.status).toBe(409);

    const otherRoute = await call(
      "POST",
      "/transactions",
      user,
      { type: "OUTCOME", name: "x", amount: 1, account_id: account.id },
      { "idempotency-key": key },
    );
    expect(otherRoute.status).toBe(409);
    expect(await transactionRows(user.userId)).toHaveLength(1);
  });

  it("400 for an empty or too long key", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const plan = await makePlan(user, account.id);

    expect((await confirm(user, plan.id, plan.next_due_date, {}, { "idempotency-key": "" })).status).toBe(400);
    expect(
      (await confirm(user, plan.id, plan.next_due_date, {}, { "idempotency-key": "k".repeat(65) })).status,
    ).toBe(400);
  });
});

describe("POST .../occurrences/:dueDate/skip", () => {
  it("200: moves to the next period without recording anything", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const plan = await makePlan(user, account.id);

    const res = await skip(user, plan.id, plan.next_due_date);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data).toEqual({ next_due_date: plusDays(plan.next_due_date, 7) });
    expect(await transactionRows(user.userId)).toHaveLength(0);
    expect(await balanceOf(user, account.id)).toBe(1_000_000);
    const detail = await planOf(user, plan.id);
    expect(detail.occurrences[0]).toMatchObject({
      due_date: plan.next_due_date,
      outcome: "SKIPPED",
      transaction_id: null,
    });
  });

  it("skipping the last period ends the plan", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const start = dayInJakarta(1);
    const plan = await makePlan(user, account.id, {
      frequency: "DAILY",
      start_date: start,
      end_date: plusDays(start, 1),
    });

    await skip(user, plan.id, start);
    const last = await (await skip(user, plan.id, plusDays(start, 1))).json();

    expect(last.data.next_due_date).toBeNull();
    expect((await planOf(user, plan.id)).status).toBe("ENDED");
  });

  it("409 when the period was already skipped or confirmed", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const plan = await makePlan(user, account.id, { frequency: "DAILY" });
    const due = plan.next_due_date;
    await skip(user, plan.id, due);

    const again = await skip(user, plan.id, due);
    expect(again.status).toBe(409);
    expect((await again.json()).data.outcome).toBe("SKIPPED");

    const nextDue = plusDays(due, 1);
    await confirm(user, plan.id, nextDue);
    const afterConfirm = await skip(user, plan.id, nextDue);
    expect(afterConfirm.status).toBe(409);
    expect((await afterConfirm.json()).data.outcome).toBe("CONFIRMED");
  });

  it("422 when the date is not the current due date, 400 for a malformed date", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const plan = await makePlan(user, account.id);

    expect((await skip(user, plan.id, plusDays(plan.next_due_date, 7))).status).toBe(422);
    expect((await skip(user, plan.id, "not-a-date")).status).toBe(400);
  });

  it("404 for another user's plan and 401 without a token", async () => {
    const owner = await newUser();
    const intruder = await newUser();
    const account = await createAccount(owner);
    const plan = await makePlan(owner, account.id);

    expect((await skip(intruder, plan.id, plan.next_due_date)).status).toBe(404);
    expect((await skip(undefined as unknown as User, plan.id, plan.next_due_date)).status).toBe(401);
    expect((await planOf(owner, plan.id)).next_due_date).toBe(plan.next_due_date);
  });

  it("deleting a transaction that came from a period does not reopen the period", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const plan = await makePlan(user, account.id);
    const confirmed = await (await confirm(user, plan.id, plan.next_due_date)).json();

    await call("DELETE", `/transactions/${confirmed.data.transaction.id}?permanent=true`, user);

    const again = await confirm(user, plan.id, plan.next_due_date);
    expect(again.status).toBe(409);
    expect((await again.json()).data).toMatchObject({ outcome: "CONFIRMED", transaction: null });
    const occurrences = await db
      .select()
      .from(planOccurrences)
      .where(eq(planOccurrences.recurringPlanId, plan.id));
    expect(occurrences[0]!.transactionId).toBeNull();
  });
});
