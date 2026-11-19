import { afterAll, describe, expect, it } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { recurringPlans } from "../../db/schema/recurring.plans.js";
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

const categoryId = async (user: User, name: string, type: "INCOME" | "OUTCOME") => {
  const json = await (await call("GET", `/categories?type=${type}`, user)).json();
  return json.data.find((c: any) => c.name === name).id as string;
};

const planBody = (accountId: string, extra: Record<string, unknown> = {}) => ({
  name: "Gym",
  type: "OUTCOME",
  amount: 350_000,
  account_id: accountId,
  frequency: "MONTHLY",
  start_date: dayInJakarta(3),
  reminder_offsets: [1, 0],
  ...extra,
});

const makePlan = async (user: User, accountId: string, extra: Record<string, unknown> = {}) => {
  const res = await call("POST", "/recurring-plans", user, planBody(accountId, extra));
  return (await res.json()).data as Record<string, any>;
};

const patch = (user: User, id: string, body: unknown) =>
  call("PATCH", `/recurring-plans/${id}`, user, body);

afterAll(async () => {
  try {
    await deleteUsers(emails);
  } finally {
    server.close();
  }
});

describe("POST /recurring-plans", () => {
  it("201: creates an active plan whose first due date is the start date", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const start = dayInJakarta(3);

    const res = await call("POST", "/recurring-plans", user, planBody(account.id, { start_date: start }));
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.success).toBe(true);
    expect(json.data).toEqual({
      id: expect.stringMatching(/^RPLAN\d{3,}$/),
      name: "Gym",
      type: "OUTCOME",
      amount: 350_000,
      account_id: account.id,
      category_id: null,
      frequency: "MONTHLY",
      start_date: start,
      end_date: null,
      reminder_offsets: [1, 0],
      auto_record: false,
      status: "ACTIVE",
      next_due_date: start,
      needs_account_change: false,
    });
  });

  it("stores every optional field and trims the name", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const category = await categoryId(user, "Kesehatan", "OUTCOME");

    const json = await (
      await call(
        "POST",
        "/recurring-plans",
        user,
        planBody(account.id, {
          name: "  Gym  ",
          category_id: category,
          end_date: dayInJakarta(400),
          auto_record: true,
          reminder_offsets: [7, 3, 1, 0],
        }),
      )
    ).json();

    expect(json.data).toMatchObject({
      name: "Gym",
      category_id: category,
      end_date: dayInJakarta(400),
      auto_record: true,
      reminder_offsets: [7, 3, 1, 0],
    });
  });

  it("an income plan can use an income category", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const salary = await categoryId(user, "Gaji", "INCOME");

    const res = await call(
      "POST",
      "/recurring-plans",
      user,
      planBody(account.id, { type: "INCOME", name: "Salary", category_id: salary }),
    );

    expect(res.status).toBe(201);
  });

  it("the start date may be today, but not in the past (422)", async () => {
    const user = await newUser();
    const account = await createAccount(user);

    expect(
      (await call("POST", "/recurring-plans", user, planBody(account.id, { start_date: dayInJakarta(0) }))).status,
    ).toBe(201);

    const past = await call("POST", "/recurring-plans", user, planBody(account.id, { start_date: dayInJakarta(-1) }));
    expect(past.status).toBe(422);
    expect((await past.json()).code).toBe("BUSINESS_RULE");
  });

  it("400: the end date must be after the start date", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const start = dayInJakarta(3);

    for (const end_date of [start, dayInJakarta(2)]) {
      const res = await call("POST", "/recurring-plans", user, planBody(account.id, { start_date: start, end_date }));
      expect(res.status).toBe(400);
      expect(Object.keys((await res.json()).errors)).toContain("end_date");
    }
    expect(
      (await call("POST", "/recurring-plans", user, planBody(account.id, { start_date: start, end_date: dayInJakarta(4) }))).status,
    ).toBe(201);
  });

  it("400: reminder offsets must be 1 to 4 distinct values from 0, 1, 3, 7", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const send = (reminder_offsets: unknown) =>
      call("POST", "/recurring-plans", user, planBody(account.id, { reminder_offsets }));

    expect((await send([])).status).toBe(400);
    expect((await send([2])).status).toBe(400);
    expect((await send([1, 1])).status).toBe(400);
    expect((await send([0, 1, 3, 7, 0])).status).toBe(400);
    expect((await send("1")).status).toBe(400);
    expect((await send([0])).status).toBe(201);
    expect((await send([0, 1, 3, 7])).status).toBe(201);
  });

  it("400: invalid fields, with errors per field", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const send = (extra: Record<string, unknown>) =>
      call("POST", "/recurring-plans", user, planBody(account.id, extra));

    const bad = await send({ name: "", type: "TRANSFER", frequency: "HOURLY" });
    const json = await bad.json();
    expect(bad.status).toBe(400);
    expect(json.code).toBe("VALIDATION_ERROR");
    expect(Object.keys(json.errors)).toEqual(
      expect.arrayContaining(["name", "type", "frequency"]),
    );

    expect((await send({ name: "n".repeat(101) })).status).toBe(400);
    expect((await send({ amount: 0 })).status).toBe(400);
    expect((await send({ amount: 1.5 })).status).toBe(400);
    expect((await send({ amount: 1_000_000_000_000 })).status).toBe(400);
    expect((await send({ start_date: "2026-13-01" })).status).toBe(400);
    expect((await send({ start_date: "13-11-2026" })).status).toBe(400);
    expect((await send({ auto_record: "yes" })).status).toBe(400);
    expect((await call("POST", "/recurring-plans", user, {})).status).toBe(400);
    expect((await call("POST", "/recurring-plans", user)).status).toBe(400);
  });

  it("400: fields the client may not set", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const send = (extra: Record<string, unknown>) =>
      call("POST", "/recurring-plans", user, planBody(account.id, extra));

    for (const extra of [
      { status: "PAUSED" },
      { next_due_date: dayInJakarta(1) },
      { user_id: "USR001" },
      { id: "RPLAN001" },
      { needs_account_change: true },
    ]) {
      expect((await send(extra)).status).toBe(400);
    }
  });

  it("422 for an archived account, 404 for a foreign or unknown account or category, 400 for a category of the wrong type", async () => {
    const user = await newUser();
    const other = await newUser();
    const archived = await createAccount(user);
    await call("POST", `/accounts/${archived.id}/archive`, user);
    const foreign = await createAccount(other);
    const account = await createAccount(user);
    const income = await categoryId(user, "Gaji", "INCOME");
    const foreignCategory = await categoryId(other, "Makanan", "OUTCOME");
    const send = (accountId: string, extra: Record<string, unknown> = {}) =>
      call("POST", "/recurring-plans", user, planBody(accountId, extra));

    expect((await send(archived.id)).status).toBe(422);
    expect((await send(foreign.id)).status).toBe(404);
    expect((await send("ACC999999")).status).toBe(404);
    expect((await send(account.id, { category_id: foreignCategory })).status).toBe(404);
    const mismatch = await send(account.id, { category_id: income });
    expect(mismatch.status).toBe(400);
    expect(Object.keys((await mismatch.json()).errors)).toContain("category_id");
  });

  it("401 without a token", async () => {
    expect((await call("POST", "/recurring-plans", undefined, {})).status).toBe(401);
  });
});

describe("GET /recurring-plans", () => {
  it("lists the user's plans by next due date, with ended plans last", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const later = await makePlan(user, account.id, { name: "Later", start_date: dayInJakarta(20) });
    const sooner = await makePlan(user, account.id, { name: "Sooner", start_date: dayInJakarta(2) });
    const endedId = await insertRecurringPlan({
      userId: user.userId,
      accountId: account.id,
      name: "Ended",
      status: "ENDED",
      nextDueDate: "2026-01-01",
    });

    const json = await (await call("GET", "/recurring-plans", user)).json();

    expect(json.data.map((p: any) => p.id)).toEqual([sooner.id, later.id, endedId]);
  });

  it("filters by status, and an ended plan reports no next due date", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const active = await makePlan(user, account.id);
    const pausedId = await insertRecurringPlan({
      userId: user.userId,
      accountId: account.id,
      status: "PAUSED",
      nextDueDate: dayInJakarta(5),
    });
    const endedId = await insertRecurringPlan({
      userId: user.userId,
      accountId: account.id,
      status: "ENDED",
    });

    const ids = async (status: string) =>
      (await (await call("GET", `/recurring-plans?status=${status}`, user)).json()).data.map((p: any) => p.id);

    expect(await ids("ACTIVE")).toEqual([active.id]);
    expect(await ids("PAUSED")).toEqual([pausedId]);
    expect(await ids("ENDED")).toEqual([endedId]);
    expect((await ids("ALL")).sort()).toEqual([active.id, pausedId, endedId].sort());

    const ended = (await (await call("GET", "/recurring-plans?status=ENDED", user)).json()).data[0];
    expect(ended.next_due_date).toBeNull();
  });

  it("an empty list, other users' plans stay hidden, and bad filters are rejected", async () => {
    const owner = await newUser();
    const other = await newUser();
    const account = await createAccount(owner);
    await makePlan(owner, account.id);

    expect((await (await call("GET", "/recurring-plans", other)).json()).data).toEqual([]);
    expect((await call("GET", "/recurring-plans?status=DONE", owner)).status).toBe(400);
    expect((await call("GET", "/recurring-plans?page=2", owner)).status).toBe(400);
    expect((await call("GET", "/recurring-plans", undefined)).status).toBe(401);
  });

  it("flags active plans whose account was archived", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const plan = await makePlan(user, account.id);
    await call("POST", `/accounts/${account.id}/archive`, user);

    const list = (await (await call("GET", "/recurring-plans", user)).json()).data;

    expect(list.find((p: any) => p.id === plan.id).needs_account_change).toBe(true);
  });
});

describe("GET /recurring-plans/:id", () => {
  it("returns the plan with its transactions and occurrences", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const start = dayInJakarta(2);
    const plan = await makePlan(user, account.id, { start_date: start });
    await call("POST", `/recurring-plans/${plan.id}/occurrences/${start}/confirm`, user, {});

    const res = await call("GET", `/recurring-plans/${plan.id}`, user);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toMatchObject({ id: plan.id, name: "Gym", status: "ACTIVE" });
    expect(json.data.transactions).toHaveLength(1);
    expect(json.data.transactions[0]).toMatchObject({
      name: "Gym",
      amount: 350_000,
      account_id: account.id,
      images_count: 0,
      items_count: 0,
    });
    expect(json.data.occurrences).toEqual([
      {
        due_date: start,
        outcome: "CONFIRMED",
        transaction_id: json.data.transactions[0].id,
        resolved_at: expect.any(String),
      },
    ]);
  });

  it("404 for another user's or an unknown plan, with identical bodies", async () => {
    const owner = await newUser();
    const intruder = await newUser();
    const account = await createAccount(owner);
    const plan = await makePlan(owner, account.id);

    const foreign = await call("GET", `/recurring-plans/${plan.id}`, intruder);
    const unknown = await call("GET", "/recurring-plans/RPLAN999999", intruder);

    expect(foreign.status).toBe(404);
    expect(await foreign.json()).toEqual(await unknown.json());
  });
});

describe("PATCH /recurring-plans/:id", () => {
  it("200: updates the given fields and keeps the due date", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const plan = await makePlan(user, account.id);

    const res = await patch(user, plan.id, {
      name: "  Yoga  ",
      amount: 400_000,
      auto_record: true,
      reminder_offsets: [3],
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toEqual({
      ...plan,
      name: "Yoga",
      amount: 400_000,
      auto_record: true,
      reminder_offsets: [3],
    });
  });

  it("a changed amount applies to the next recorded period, not to past ones", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const start = dayInJakarta(1);
    const plan = await makePlan(user, account.id, { start_date: start, frequency: "WEEKLY", amount: 100_000 });

    await call("POST", `/recurring-plans/${plan.id}/occurrences/${start}/confirm`, user, {});
    await patch(user, plan.id, { amount: 150_000 });
    const next = (await (await call("GET", `/recurring-plans/${plan.id}`, user)).json()).data.next_due_date;
    await call("POST", `/recurring-plans/${plan.id}/occurrences/${next}/confirm`, user, {});

    const amounts = (await transactionRows(user.userId)).map((t) => t.amount).sort();
    expect(amounts).toEqual([100_000, 150_000]);
  });

  it("changing the frequency keeps the current due date and continues with the new rhythm", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const start = dayInJakarta(3);
    const plan = await makePlan(user, account.id, { start_date: start, frequency: "MONTHLY" });

    const json = await (await patch(user, plan.id, { frequency: "WEEKLY" })).json();

    expect(json.data.frequency).toBe("WEEKLY");
    expect(json.data.next_due_date).toBe(start);
    expect(json.data.start_date).toBe(start);

    const confirmed = await (
      await call("POST", `/recurring-plans/${plan.id}/occurrences/${start}/confirm`, user, {})
    ).json();
    const expected = new Date(`${start}T00:00:00Z`);
    expected.setUTCDate(expected.getUTCDate() + 7);
    expect(confirmed.data.next_due_date).toBe(expected.toISOString().slice(0, 10));
  });

  it("an end date on the next due date keeps the plan active until that period is resolved", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const first = dayInJakarta(2);
    const second = dayInJakarta(3);
    const plan = await makePlan(user, account.id, { start_date: first, frequency: "DAILY" });
    await call("POST", `/recurring-plans/${plan.id}/occurrences/${first}/confirm`, user, {});

    const patched = await (await patch(user, plan.id, { end_date: second })).json();
    expect(patched.data.status).toBe("ACTIVE");
    expect(patched.data.next_due_date).toBe(second);

    const confirmed = await (
      await call("POST", `/recurring-plans/${plan.id}/occurrences/${second}/confirm`, user, {})
    ).json();
    expect(confirmed.data.next_due_date).toBeNull();

    const after = (await (await call("GET", `/recurring-plans/${plan.id}`, user)).json()).data;
    expect(after.status).toBe("ENDED");
    expect(after.next_due_date).toBeNull();
  });

  it("an end date earlier than the next due date ends the plan at once", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const first = dayInJakarta(10);
    const second = dayInJakarta(11);
    const plan = await makePlan(user, account.id, { start_date: first, frequency: "DAILY" });
    await call("POST", `/recurring-plans/${plan.id}/occurrences/${first}/confirm`, user, {});
    await call("POST", `/recurring-plans/${plan.id}/occurrences/${second}/confirm`, user, {});

    const json = await (await patch(user, plan.id, { end_date: second })).json();

    expect(json.data.status).toBe("ENDED");
    expect(json.data.next_due_date).toBeNull();
  });

  it("400 when the end date is not after the start date, and null clears it", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const start = dayInJakarta(3);
    const plan = await makePlan(user, account.id, { start_date: start, end_date: dayInJakarta(60) });

    const bad = await patch(user, plan.id, { end_date: start });
    expect(bad.status).toBe(400);
    expect(Object.keys((await bad.json()).errors)).toContain("end_date");

    const cleared = await patch(user, plan.id, { end_date: null });
    expect(cleared.status).toBe(200);
    expect((await cleared.json()).data.end_date).toBeNull();
  });

  it("422 when changing a plan that has ended", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const endedId = await insertRecurringPlan({
      userId: user.userId,
      accountId: account.id,
      status: "ENDED",
    });

    const res = await patch(user, endedId, { name: "Revive" });

    expect(res.status).toBe(422);
    expect((await res.json()).code).toBe("BUSINESS_RULE");
  });

  it("422 for an archived account, 404 for a foreign one, and a category of the wrong type is rejected", async () => {
    const user = await newUser();
    const other = await newUser();
    const account = await createAccount(user);
    const archived = await createAccount(user);
    await call("POST", `/accounts/${archived.id}/archive`, user);
    const foreign = await createAccount(other);
    const income = await categoryId(user, "Gaji", "INCOME");
    const plan = await makePlan(user, account.id);

    expect((await patch(user, plan.id, { account_id: archived.id })).status).toBe(422);
    expect((await patch(user, plan.id, { account_id: foreign.id })).status).toBe(404);
    expect((await patch(user, plan.id, { category_id: income })).status).toBe(400);
    expect((await patch(user, plan.id, { type: "INCOME", category_id: income })).status).toBe(200);
  });

  it("400: empty body and fields that cannot be changed", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const plan = await makePlan(user, account.id);

    for (const body of [
      {},
      { name: "" },
      { amount: 0 },
      { reminder_offsets: [5] },
      { start_date: dayInJakarta(9) },
      { next_due_date: dayInJakarta(9) },
      { status: "PAUSED" },
      { user_id: "USR001" },
    ]) {
      expect((await patch(user, plan.id, body)).status).toBe(400);
    }
  });

  it("404 for another user's plan, which stays untouched", async () => {
    const owner = await newUser();
    const intruder = await newUser();
    const account = await createAccount(owner);
    const plan = await makePlan(owner, account.id);

    expect((await patch(intruder, plan.id, { name: "Hacked" })).status).toBe(404);
    expect((await planRow(plan.id)).name).toBe("Gym");
  });

  it("401 without a token", async () => {
    expect((await patch(undefined as unknown as User, "RPLAN001", { name: "x" })).status).toBe(401);
  });
});

describe("DELETE /recurring-plans/:id", () => {
  it("204: past transactions remain and lose their plan", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const start = dayInJakarta(1);
    const plan = await makePlan(user, account.id, { start_date: start });
    const confirmed = await (
      await call("POST", `/recurring-plans/${plan.id}/occurrences/${start}/confirm`, user, {})
    ).json();

    const res = await call("DELETE", `/recurring-plans/${plan.id}`, user);

    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");
    expect((await call("GET", `/recurring-plans/${plan.id}`, user)).status).toBe(404);
    const detail = await (
      await call("GET", `/transactions/${confirmed.data.transaction.id}`, user)
    ).json();
    expect(detail.data.plan_id).toBeNull();
  });

  it("404 when deleted twice, or for another user's plan, which stays", async () => {
    const owner = await newUser();
    const intruder = await newUser();
    const account = await createAccount(owner);
    const plan = await makePlan(owner, account.id);

    expect((await call("DELETE", `/recurring-plans/${plan.id}`, intruder)).status).toBe(404);
    expect((await call("GET", `/recurring-plans/${plan.id}`, owner)).status).toBe(200);
    await call("DELETE", `/recurring-plans/${plan.id}`, owner);
    expect((await call("DELETE", `/recurring-plans/${plan.id}`, owner)).status).toBe(404);
  });

  it("the account can be deleted once the plan is gone", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const plan = await makePlan(user, account.id);

    expect((await call("DELETE", `/accounts/${account.id}`, user)).status).toBe(422);
    await call("DELETE", `/recurring-plans/${plan.id}`, user);
    expect((await call("DELETE", `/accounts/${account.id}`, user)).status).toBe(204);
  });
});

describe("POST /recurring-plans/:id/pause and /resume", () => {
  it("pauses and resumes, and both are harmless when repeated", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const plan = await makePlan(user, account.id);

    const paused = await call("POST", `/recurring-plans/${plan.id}/pause`, user);
    expect(paused.status).toBe(200);
    expect((await paused.json()).data.status).toBe("PAUSED");
    expect((await call("POST", `/recurring-plans/${plan.id}/pause`, user)).status).toBe(200);

    const resumed = await call("POST", `/recurring-plans/${plan.id}/resume`, user);
    expect(resumed.status).toBe(200);
    expect((await resumed.json()).data).toMatchObject({
      status: "ACTIVE",
      next_due_date: plan.next_due_date,
    });
    expect((await call("POST", `/recurring-plans/${plan.id}/resume`, user)).status).toBe(200);
  });

  it("a paused plan cannot be confirmed or skipped", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const plan = await makePlan(user, account.id);
    await call("POST", `/recurring-plans/${plan.id}/pause`, user);

    const confirm = await call("POST", `/recurring-plans/${plan.id}/occurrences/${plan.next_due_date}/confirm`, user, {});
    const skip = await call("POST", `/recurring-plans/${plan.id}/occurrences/${plan.next_due_date}/skip`, user);

    expect(confirm.status).toBe(422);
    expect(skip.status).toBe(422);
  });

  it("resuming moves a past due date to the next upcoming one, without backdated periods", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const planId = await insertRecurringPlan({
      userId: user.userId,
      accountId: account.id,
      frequency: "DAILY",
      startDate: dayInJakarta(-10),
      nextDueDate: dayInJakarta(-10),
      status: "PAUSED",
    });

    const json = await (await call("POST", `/recurring-plans/${planId}/resume`, user)).json();

    expect(json.data.status).toBe("ACTIVE");
    expect(json.data.next_due_date).toBe(dayInJakarta(0));
    expect(await transactionRows(user.userId)).toHaveLength(0);
  });

  it("resuming keeps the month-end rule: Jan 31 continues on the 28th, then the 31st", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const planId = await insertRecurringPlan({
      userId: user.userId,
      accountId: account.id,
      frequency: "MONTHLY",
      startDate: "2024-01-31",
      nextDueDate: "2024-01-31",
      status: "PAUSED",
    });

    const json = await (await call("POST", `/recurring-plans/${planId}/resume`, user)).json();

    expect(json.data.next_due_date >= dayInJakarta(0)).toBe(true);
    const day = Number(json.data.next_due_date.slice(8));
    expect([28, 29, 30, 31]).toContain(day);
  });

  it("resuming a plan whose end date has passed ends it", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const planId = await insertRecurringPlan({
      userId: user.userId,
      accountId: account.id,
      frequency: "DAILY",
      startDate: dayInJakarta(-10),
      endDate: dayInJakarta(-5),
      nextDueDate: dayInJakarta(-8),
      status: "PAUSED",
    });

    const json = await (await call("POST", `/recurring-plans/${planId}/resume`, user)).json();

    expect(json.data.status).toBe("ENDED");
    expect(json.data.next_due_date).toBeNull();
  });

  it("422 for an ended plan, 404 for another user's plan, and 401 without a token", async () => {
    const owner = await newUser();
    const intruder = await newUser();
    const account = await createAccount(owner);
    const plan = await makePlan(owner, account.id);
    const endedId = await insertRecurringPlan({
      userId: owner.userId,
      accountId: account.id,
      status: "ENDED",
    });

    expect((await call("POST", `/recurring-plans/${endedId}/pause`, owner)).status).toBe(422);
    expect((await call("POST", `/recurring-plans/${endedId}/resume`, owner)).status).toBe(422);
    expect((await call("POST", `/recurring-plans/${plan.id}/pause`, intruder)).status).toBe(404);
    expect((await call("POST", `/recurring-plans/${plan.id}/resume`, undefined)).status).toBe(401);
    expect((await db.select().from(recurringPlans).where(eq(recurringPlans.id, plan.id)))[0]!.status).toBe("ACTIVE");
  });
});
