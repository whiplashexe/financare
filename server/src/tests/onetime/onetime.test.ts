import { afterAll, describe, expect, it } from "bun:test";
import {
  createUser,
  dayInJakarta,
  deleteUsers,
  insertOneTimePlan,
  oneTimeRow,
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
    initial_balance: 1_200_000,
    ...body,
  });
  return (await res.json()).data as Record<string, any>;
};

const planBody = (extra: Record<string, unknown> = {}) => ({
  name: "Black Friday Shopping",
  date: dayInJakarta(10),
  target_amount: 1_500_000,
  reminder_offsets: [7, 3, 1],
  ...extra,
});

const makePlan = async (user: User, extra: Record<string, unknown> = {}) => {
  const res = await call("POST", "/one-time-plans", user, planBody(extra));
  return (await res.json()).data as Record<string, any>;
};

const patch = (user: User, id: string, body: unknown) =>
  call("PATCH", `/one-time-plans/${id}`, user, body);
const complete = (user: User, id: string, body?: unknown) =>
  call("POST", `/one-time-plans/${id}/complete`, user, body);
const cancel = (user: User, id: string) =>
  call("POST", `/one-time-plans/${id}/cancel`, user);
const detail = async (user: User, id: string) =>
  (await (await call("GET", `/one-time-plans/${id}`, user)).json()).data as Record<string, any>;
const balanceOf = async (user: User, accountId: string) =>
  (await (await call("GET", `/accounts/${accountId}`, user)).json()).data.current_balance as number;

afterAll(async () => {
  try {
    await deleteUsers(emails);
  } finally {
    server.close();
  }
});

describe("POST /one-time-plans", () => {
  it("201: a plan with the funding status of its source account", async () => {
    const user = await newUser();
    const account = await createAccount(user);

    const res = await call(
      "POST",
      "/one-time-plans",
      user,
      planBody({
        source_account_id: account.id,
        location: "Bali Galeria Mall",
        note: "Shoes, bag",
      }),
    );
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.success).toBe(true);
    expect(json.data).toEqual({
      id: expect.stringMatching(/^OPLAN\d{3,}$/),
      name: "Black Friday Shopping",
      date: dayInJakarta(10),
      target_amount: 1_500_000,
      source_account_id: account.id,
      location: "Bali Galeria Mall",
      note: "Shoes, bag",
      reminder_offsets: [7, 3, 1],
      status: "PLANNED",
      funding: { available: 1_200_000, shortfall: 300_000, sufficient: false },
    });
  });

  it("funding is sufficient when the balance covers the target, with no shortfall", async () => {
    const user = await newUser();
    const account = await createAccount(user, { initial_balance: 2_000_000 });

    const json = await (await call("POST", "/one-time-plans", user, planBody({ source_account_id: account.id }))).json();

    expect(json.data.funding).toEqual({ available: 2_000_000, shortfall: 0, sufficient: true });
  });

  it("funding is exactly sufficient when the balance equals the target", async () => {
    const user = await newUser();
    const account = await createAccount(user, { initial_balance: 1_500_000 });

    const json = await (await call("POST", "/one-time-plans", user, planBody({ source_account_id: account.id }))).json();

    expect(json.data.funding).toEqual({ available: 1_500_000, shortfall: 0, sufficient: true });
  });

  it("without a source account, funding uses the total balance of active accounts included in the total", async () => {
    const user = await newUser();
    await createAccount(user, { initial_balance: 700_000 });
    await createAccount(user, { initial_balance: 800_000 });
    await createAccount(user, { initial_balance: 5_000_000, include_in_total: false });
    const archived = await createAccount(user, { initial_balance: 9_000_000 });
    await call("POST", `/accounts/${archived.id}/archive`, user);

    const json = await (await call("POST", "/one-time-plans", user, planBody())).json();

    expect(json.data.source_account_id).toBeNull();
    expect(json.data.funding).toEqual({ available: 1_500_000, shortfall: 0, sufficient: true });
  });

  it("funding follows the account's real balance, transactions included", async () => {
    const user = await newUser();
    const account = await createAccount(user, { initial_balance: 2_000_000 });
    await call("POST", "/transactions", user, {
      type: "OUTCOME",
      name: "Rent",
      amount: 900_000,
      account_id: account.id,
    });

    const json = await (await call("POST", "/one-time-plans", user, planBody({ source_account_id: account.id }))).json();

    expect(json.data.funding).toEqual({ available: 1_100_000, shortfall: 400_000, sufficient: false });
  });

  it("the date may be today, but not in the past (422)", async () => {
    const user = await newUser();

    expect((await call("POST", "/one-time-plans", user, planBody({ date: dayInJakarta(0) }))).status).toBe(201);
    const past = await call("POST", "/one-time-plans", user, planBody({ date: dayInJakarta(-1) }));
    expect(past.status).toBe(422);
    expect((await past.json()).code).toBe("BUSINESS_RULE");
  });

  it("400: reminder offsets must be 1 to 4 distinct values from 1, 3, 7, 14", async () => {
    const user = await newUser();
    const send = (reminder_offsets: unknown) =>
      call("POST", "/one-time-plans", user, planBody({ reminder_offsets }));

    expect((await send([])).status).toBe(400);
    expect((await send([0])).status).toBe(400);
    expect((await send([2])).status).toBe(400);
    expect((await send([1, 1])).status).toBe(400);
    expect((await send([1, 3, 7, 14, 1])).status).toBe(400);
    expect((await send("7")).status).toBe(400);
    expect((await send([14])).status).toBe(201);
    expect((await send([1, 3, 7, 14])).status).toBe(201);
  });

  it("400: invalid fields, with errors per field", async () => {
    const user = await newUser();
    const send = (extra: Record<string, unknown>) =>
      call("POST", "/one-time-plans", user, planBody(extra));

    const bad = await send({ name: "", target_amount: 0, date: "soon" });
    const json = await bad.json();
    expect(bad.status).toBe(400);
    expect(json.code).toBe("VALIDATION_ERROR");
    expect(Object.keys(json.errors)).toEqual(
      expect.arrayContaining(["name", "target_amount", "date"]),
    );

    expect((await send({ name: "n".repeat(101) })).status).toBe(400);
    expect((await send({ target_amount: 1.5 })).status).toBe(400);
    expect((await send({ target_amount: 1_000_000_000_000 })).status).toBe(400);
    expect((await send({ date: "2026-13-01" })).status).toBe(400);
    expect((await send({ location: "l".repeat(256) })).status).toBe(400);
    expect((await send({ note: "n".repeat(1001) })).status).toBe(400);
    expect((await call("POST", "/one-time-plans", user, {})).status).toBe(400);
    expect((await call("POST", "/one-time-plans", user)).status).toBe(400);
    expect((await send({ location: "l".repeat(255), note: "n".repeat(1000) })).status).toBe(201);
  });

  it("400: fields the client may not set", async () => {
    const user = await newUser();
    const send = (extra: Record<string, unknown>) =>
      call("POST", "/one-time-plans", user, planBody(extra));

    for (const extra of [
      { status: "DONE" },
      { funding: {} },
      { user_id: "USR001" },
      { id: "OPLAN001" },
    ]) {
      expect((await send(extra)).status).toBe(400);
    }
  });

  it("422 for an archived source account, 404 for a foreign or unknown one", async () => {
    const user = await newUser();
    const other = await newUser();
    const archived = await createAccount(user);
    await call("POST", `/accounts/${archived.id}/archive`, user);
    const foreign = await createAccount(other);

    expect((await call("POST", "/one-time-plans", user, planBody({ source_account_id: archived.id }))).status).toBe(422);
    expect((await call("POST", "/one-time-plans", user, planBody({ source_account_id: foreign.id }))).status).toBe(404);
    expect((await call("POST", "/one-time-plans", user, planBody({ source_account_id: "ACC999999" }))).status).toBe(404);
  });

  it("401 without a token", async () => {
    expect((await call("POST", "/one-time-plans", undefined, {})).status).toBe(401);
  });
});

describe("GET /one-time-plans", () => {
  it("lists open plans by date first, finished ones last, and funding only for open plans", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const later = await makePlan(user, { name: "Later", date: dayInJakarta(30) });
    const sooner = await makePlan(user, { name: "Sooner", date: dayInJakarta(5) });
    const missedId = await insertOneTimePlan({ userId: user.userId, date: dayInJakarta(-3), status: "MISSED" });
    const doneId = await insertOneTimePlan({
      userId: user.userId,
      sourceAccountId: account.id,
      date: dayInJakarta(-9),
      status: "DONE",
    });
    const cancelledId = await insertOneTimePlan({ userId: user.userId, date: dayInJakarta(-1), status: "CANCELLED" });

    const json = await (await call("GET", "/one-time-plans", user)).json();

    expect(json.data.map((p: any) => p.id)).toEqual([
      missedId,
      sooner.id,
      later.id,
      doneId,
      cancelledId,
    ]);
    const byId = Object.fromEntries(json.data.map((p: any) => [p.id, p]));
    expect(byId[missedId].funding).not.toBeNull();
    expect(byId[sooner.id].funding).not.toBeNull();
    expect(byId[doneId].funding).toBeNull();
    expect(byId[cancelledId].funding).toBeNull();
  });

  it("filters by status", async () => {
    const user = await newUser();
    const planned = await makePlan(user);
    const doneId = await insertOneTimePlan({ userId: user.userId, date: dayInJakarta(-2), status: "DONE" });
    const missedId = await insertOneTimePlan({ userId: user.userId, date: dayInJakarta(-2), status: "MISSED" });
    const ids = async (status: string) =>
      (await (await call("GET", `/one-time-plans?status=${status}`, user)).json()).data.map((p: any) => p.id);

    expect(await ids("PLANNED")).toEqual([planned.id]);
    expect(await ids("DONE")).toEqual([doneId]);
    expect(await ids("MISSED")).toEqual([missedId]);
    expect(await ids("CANCELLED")).toEqual([]);
    expect((await ids("ALL")).sort()).toEqual([planned.id, doneId, missedId].sort());
  });

  it("funding in the list follows the live balance", async () => {
    const user = await newUser();
    const account = await createAccount(user, { initial_balance: 1_000_000 });
    const plan = await makePlan(user, { source_account_id: account.id, target_amount: 800_000 });
    expect(plan.funding.sufficient).toBe(true);

    await call("POST", "/transactions", user, {
      type: "OUTCOME",
      name: "Spend",
      amount: 500_000,
      account_id: account.id,
    });

    const json = await (await call("GET", "/one-time-plans", user)).json();
    expect(json.data[0].funding).toEqual({ available: 500_000, shortfall: 300_000, sufficient: false });
  });

  it("an empty list, other users' plans hidden, bad filters rejected", async () => {
    const owner = await newUser();
    const other = await newUser();
    await makePlan(owner);

    expect((await (await call("GET", "/one-time-plans", other)).json()).data).toEqual([]);
    expect((await call("GET", "/one-time-plans?status=OPEN", owner)).status).toBe(400);
    expect((await call("GET", "/one-time-plans?page=2", owner)).status).toBe(400);
    expect((await call("GET", "/one-time-plans", undefined)).status).toBe(401);
  });
});

describe("GET /one-time-plans/:id", () => {
  it("returns the plan, its funding, and the transactions recorded for it", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const plan = await makePlan(user, { source_account_id: account.id, target_amount: 500_000 });
    await complete(user, plan.id, { create_transaction: true });
    const second = await makePlan(user, { source_account_id: account.id, target_amount: 100_000 });

    const json = await detail(user, plan.id);

    expect(json).toMatchObject({ id: plan.id, status: "DONE", funding: null });
    expect(json.transactions).toHaveLength(1);
    expect(json.transactions[0]).toMatchObject({
      name: "Black Friday Shopping",
      amount: 500_000,
      type: "OUTCOME",
    });
    expect((await detail(user, second.id)).transactions).toEqual([]);
  });

  it("404 for another user's or an unknown plan, with identical bodies", async () => {
    const owner = await newUser();
    const intruder = await newUser();
    const plan = await makePlan(owner);

    const foreign = await call("GET", `/one-time-plans/${plan.id}`, intruder);
    const unknown = await call("GET", "/one-time-plans/OPLAN999999", intruder);

    expect(foreign.status).toBe(404);
    expect(await foreign.json()).toEqual(await unknown.json());
  });
});

describe("PATCH /one-time-plans/:id", () => {
  it("200: updates the given fields only, and funding follows the target", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const plan = await makePlan(user, { source_account_id: account.id, note: "keep" });

    const res = await patch(user, plan.id, {
      name: "  Renamed  ",
      target_amount: 1_000_000,
      reminder_offsets: [14],
      location: "Mall",
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toEqual({
      ...plan,
      name: "Renamed",
      target_amount: 1_000_000,
      reminder_offsets: [14],
      location: "Mall",
      funding: { available: 1_200_000, shortfall: 0, sufficient: true },
    });
  });

  it("reschedules a planned plan to another date, and null clears optional fields", async () => {
    const user = await newUser();
    const plan = await makePlan(user, { location: "Here", note: "x" });

    const json = await (
      await patch(user, plan.id, { date: dayInJakarta(40), location: null, note: null })
    ).json();

    expect(json.data).toMatchObject({
      date: dayInJakarta(40),
      status: "PLANNED",
      location: null,
      note: null,
    });
  });

  it("422 when moving a planned plan to a past date, but its own date may be sent unchanged", async () => {
    const user = await newUser();
    const plan = await makePlan(user);

    expect((await patch(user, plan.id, { date: dayInJakarta(-1) })).status).toBe(422);
    expect((await patch(user, plan.id, { date: plan.date, name: "Same date" })).status).toBe(200);
  });

  it("a missed plan returns to planned when given a new date", async () => {
    const user = await newUser();
    const missedId = await insertOneTimePlan({ userId: user.userId, date: dayInJakarta(-4), status: "MISSED" });

    const res = await patch(user, missedId, { date: dayInJakarta(12) });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toMatchObject({ status: "PLANNED", date: dayInJakarta(12) });
  });

  it("a missed plan stays missed when other fields change, and cannot be moved to the past", async () => {
    const user = await newUser();
    const missedId = await insertOneTimePlan({ userId: user.userId, date: dayInJakarta(-4), status: "MISSED" });

    const renamed = await patch(user, missedId, { name: "Still missed" });
    expect((await renamed.json()).data.status).toBe("MISSED");

    expect((await patch(user, missedId, { date: dayInJakarta(-4) })).status).toBe(422);
    expect((await patch(user, missedId, { date: dayInJakarta(-1) })).status).toBe(422);
    expect((await oneTimeRow(missedId)).status).toBe("MISSED");
  });

  it("422 when changing a plan that is done or cancelled", async () => {
    const user = await newUser();
    const doneId = await insertOneTimePlan({ userId: user.userId, date: dayInJakarta(-2), status: "DONE" });
    const cancelledId = await insertOneTimePlan({ userId: user.userId, date: dayInJakarta(2), status: "CANCELLED" });

    for (const id of [doneId, cancelledId]) {
      const res = await patch(user, id, { name: "Revive" });
      expect(res.status).toBe(422);
      expect((await res.json()).code).toBe("BUSINESS_RULE");
    }
  });

  it("changes or clears the source account; clearing switches funding to the total balance", async () => {
    const user = await newUser();
    const small = await createAccount(user, { initial_balance: 100_000 });
    const big = await createAccount(user, { initial_balance: 3_000_000 });
    const plan = await makePlan(user, { source_account_id: small.id });
    expect(plan.funding.available).toBe(100_000);

    const moved = await (await patch(user, plan.id, { source_account_id: big.id })).json();
    expect(moved.data.funding.available).toBe(3_000_000);

    const cleared = await (await patch(user, plan.id, { source_account_id: null })).json();
    expect(cleared.data.source_account_id).toBeNull();
    expect(cleared.data.funding.available).toBe(3_100_000);
  });

  it("422 for an archived source account, 404 for a foreign one", async () => {
    const user = await newUser();
    const other = await newUser();
    const archived = await createAccount(user);
    await call("POST", `/accounts/${archived.id}/archive`, user);
    const foreign = await createAccount(other);
    const plan = await makePlan(user);

    expect((await patch(user, plan.id, { source_account_id: archived.id })).status).toBe(422);
    expect((await patch(user, plan.id, { source_account_id: foreign.id })).status).toBe(404);
  });

  it("400: empty body, invalid values, and fields that cannot be changed", async () => {
    const user = await newUser();
    const plan = await makePlan(user);

    for (const body of [
      {},
      { name: "" },
      { target_amount: 0 },
      { date: "soon" },
      { reminder_offsets: [0] },
      { status: "DONE" },
      { funding: {} },
      { user_id: "USR001" },
    ]) {
      expect((await patch(user, plan.id, body)).status).toBe(400);
    }
  });

  it("404 for another user's plan, which stays untouched", async () => {
    const owner = await newUser();
    const intruder = await newUser();
    const plan = await makePlan(owner);

    expect((await patch(intruder, plan.id, { name: "Hacked" })).status).toBe(404);
    expect((await oneTimeRow(plan.id)).name).toBe("Black Friday Shopping");
  });

  it("401 without a token", async () => {
    expect((await patch(undefined as unknown as User, "OPLAN001", { name: "x" })).status).toBe(401);
  });
});

describe("DELETE /one-time-plans/:id", () => {
  it("204: the transactions recorded for the plan remain, without the link", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const plan = await makePlan(user, { source_account_id: account.id, target_amount: 100_000 });
    const completed = await (await complete(user, plan.id, { create_transaction: true })).json();

    const res = await call("DELETE", `/one-time-plans/${plan.id}`, user);

    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");
    expect((await call("GET", `/one-time-plans/${plan.id}`, user)).status).toBe(404);
    const transaction = await (
      await call("GET", `/transactions/${completed.data.transaction.id}`, user)
    ).json();
    expect(transaction.data.plan_id).toBeNull();
  });

  it("404 when deleted twice, or for another user's plan, which stays", async () => {
    const owner = await newUser();
    const intruder = await newUser();
    const plan = await makePlan(owner);

    expect((await call("DELETE", `/one-time-plans/${plan.id}`, intruder)).status).toBe(404);
    expect((await call("GET", `/one-time-plans/${plan.id}`, owner)).status).toBe(200);
    await call("DELETE", `/one-time-plans/${plan.id}`, owner);
    expect((await call("DELETE", `/one-time-plans/${plan.id}`, owner)).status).toBe(404);
  });

  it("deleting the source account keeps the plan, which then uses the total balance", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const plan = await makePlan(user, { source_account_id: account.id });

    expect((await call("DELETE", `/accounts/${account.id}`, user)).status).toBe(204);

    const after = await detail(user, plan.id);
    expect(after.source_account_id).toBeNull();
    expect(after.funding.available).toBe(0);
  });
});

describe("POST /one-time-plans/:id/complete", () => {
  it("marks the plan done without a transaction", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const plan = await makePlan(user, { source_account_id: account.id });

    const res = await complete(user, plan.id, { create_transaction: false });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.plan).toMatchObject({ id: plan.id, status: "DONE", funding: null });
    expect(json.data.transaction).toBeUndefined();
    expect(await transactionRows(user.userId)).toHaveLength(0);
    expect(await balanceOf(user, account.id)).toBe(1_200_000);
  });

  it("works with no body at all", async () => {
    const user = await newUser();
    const plan = await makePlan(user);

    const res = await complete(user, plan.id);

    expect(res.status).toBe(200);
    expect((await res.json()).data.plan.status).toBe("DONE");
  });

  it("with create_transaction it records an outcome from the plan and marks it done", async () => {
    const user = await newUser();
    const account = await createAccount(user, { initial_balance: 3_000_000 });
    const plan = await makePlan(user, {
      source_account_id: account.id,
      target_amount: 1_420_000,
      location: "Bali Galeria Mall",
      note: "Shoes, bag",
    });

    const res = await complete(user, plan.id, { create_transaction: true });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.plan).toMatchObject({ id: plan.id, status: "DONE", funding: null });
    expect(json.data.transaction).toMatchObject({
      id: expect.stringMatching(/^TRANS\d{3,}$/),
      type: "OUTCOME",
      name: "Black Friday Shopping",
      amount: 1_420_000,
      account_id: account.id,
      location: "Bali Galeria Mall",
      note: "Shoes, bag",
      plan_id: plan.id,
      source: "MANUAL",
    });
    expect(json.data.account_balance_after).toBe(1_580_000);
    expect(json.data.warnings).toEqual([]);
    expect(await balanceOf(user, account.id)).toBe(1_580_000);
  });

  it("the overrides change the transaction but not the plan's target", async () => {
    const user = await newUser();
    const source = await createAccount(user);
    const other = await createAccount(user, { initial_balance: 5_000_000 });
    const plan = await makePlan(user, { source_account_id: source.id, target_amount: 1_500_000 });

    const json = await (
      await complete(user, plan.id, {
        create_transaction: true,
        amount: 1_420_000,
        account_id: other.id,
        date: "2026-11-10T06:00:00Z",
      })
    ).json();

    expect(json.data.transaction).toMatchObject({
      amount: 1_420_000,
      account_id: other.id,
      date: "2026-11-10T06:00:00.000Z",
    });
    expect(await balanceOf(user, other.id)).toBe(3_580_000);
    expect((await oneTimeRow(plan.id)).targetAmount).toBe(1_500_000);
  });

  it("an account must come from the request or the plan: 422 with what is missing, and the plan stays open", async () => {
    const user = await newUser();
    const plan = await makePlan(user);

    const res = await complete(user, plan.id, { create_transaction: true });
    const json = await res.json();

    expect(res.status).toBe(422);
    expect(json.code).toBe("BUSINESS_RULE");
    expect(json.data).toEqual({ missing: ["account_id"] });
    expect((await oneTimeRow(plan.id)).status).toBe("PLANNED");

    const account = await createAccount(user);
    const retry = await complete(user, plan.id, { create_transaction: true, account_id: account.id });
    expect(retry.status).toBe(200);
  });

  it("warns NEGATIVE_BALANCE when the spending overdraws the account, but still completes", async () => {
    const user = await newUser();
    const account = await createAccount(user, { initial_balance: 100_000 });
    const plan = await makePlan(user, { source_account_id: account.id, target_amount: 500_000 });

    const json = await (await complete(user, plan.id, { create_transaction: true })).json();

    expect(json.data.account_balance_after).toBe(-400_000);
    expect(json.data.warnings).toEqual([
      { code: "NEGATIVE_BALANCE", account_id: account.id, balance_after: -400_000 },
    ]);
    expect(json.data.plan.status).toBe("DONE");
  });

  it("a missed plan can still be completed", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const missedId = await insertOneTimePlan({
      userId: user.userId,
      sourceAccountId: account.id,
      date: dayInJakarta(-4),
      status: "MISSED",
      targetAmount: 10_000,
    });

    const res = await complete(user, missedId, { create_transaction: true });

    expect(res.status).toBe(200);
    expect((await res.json()).data.plan.status).toBe("DONE");
  });

  it("422 when the plan is already done or cancelled", async () => {
    const user = await newUser();
    const plan = await makePlan(user);
    await complete(user, plan.id);

    const again = await complete(user, plan.id);
    expect(again.status).toBe(422);
    expect((await again.json()).code).toBe("BUSINESS_RULE");

    const other = await makePlan(user);
    await cancel(user, other.id);
    expect((await complete(user, other.id)).status).toBe(422);
    expect(await transactionRows(user.userId)).toHaveLength(0);
  });

  it("400: transaction fields without create_transaction, and invalid values", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const plan = await makePlan(user, { source_account_id: account.id });

    const withoutFlag = await complete(user, plan.id, { amount: 1000 });
    expect(withoutFlag.status).toBe(400);
    expect(Object.keys((await withoutFlag.json()).errors)).toContain("amount");
    expect((await complete(user, plan.id, { create_transaction: false, account_id: account.id })).status).toBe(400);
    expect((await complete(user, plan.id, { create_transaction: true, amount: 0 })).status).toBe(400);
    expect((await complete(user, plan.id, { create_transaction: true, amount: 1.5 })).status).toBe(400);
    expect((await complete(user, plan.id, { create_transaction: true, date: "2026-12-12T06:00:00" })).status).toBe(400);
    expect((await complete(user, plan.id, { create_transaction: "yes" })).status).toBe(400);
    expect((await complete(user, plan.id, { create_transaction: true, name: "x" })).status).toBe(400);
    expect((await oneTimeRow(plan.id)).status).toBe("PLANNED");
  });

  it("a failing transaction leaves the plan open and records nothing", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const archived = await createAccount(user);
    await call("POST", `/accounts/${archived.id}/archive`, user);
    const plan = await makePlan(user, { source_account_id: account.id });
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const future = await complete(user, plan.id, { create_transaction: true, date: tomorrow });
    const archivedAccount = await complete(user, plan.id, { create_transaction: true, account_id: archived.id });

    expect(future.status).toBe(422);
    expect(archivedAccount.status).toBe(422);
    expect((await oneTimeRow(plan.id)).status).toBe("PLANNED");
    expect(await transactionRows(user.userId)).toHaveLength(0);
  });

  it("two simultaneous completions with a transaction record only one", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const plan = await makePlan(user, { source_account_id: account.id, target_amount: 50_000 });

    const [a, b] = await Promise.all([
      complete(user, plan.id, { create_transaction: true }),
      complete(user, plan.id, { create_transaction: true }),
    ]);

    expect([a.status, b.status].sort()).toEqual([200, 422]);
    expect(await transactionRows(user.userId)).toHaveLength(1);
    expect(await balanceOf(user, account.id)).toBe(1_150_000);
  });

  it("404 for another user's plan and 401 without a token", async () => {
    const owner = await newUser();
    const intruder = await newUser();
    const plan = await makePlan(owner);

    expect((await complete(intruder, plan.id)).status).toBe(404);
    expect((await complete(undefined as unknown as User, plan.id)).status).toBe(401);
    expect((await oneTimeRow(plan.id)).status).toBe("PLANNED");
  });
});

describe("POST /one-time-plans/:id/cancel", () => {
  it("cancels a planned plan, and funding is no longer reported", async () => {
    const user = await newUser();
    const plan = await makePlan(user);

    const res = await cancel(user, plan.id);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toMatchObject({ id: plan.id, status: "CANCELLED", funding: null });
  });

  it("cancels a missed plan, and cancelling twice is harmless", async () => {
    const user = await newUser();
    const missedId = await insertOneTimePlan({ userId: user.userId, date: dayInJakarta(-2), status: "MISSED" });

    expect((await cancel(user, missedId)).status).toBe(200);
    const again = await cancel(user, missedId);
    expect(again.status).toBe(200);
    expect((await again.json()).data.status).toBe("CANCELLED");
  });

  it("422 for a plan that is done, and a cancelled plan can no longer be changed or completed", async () => {
    const user = await newUser();
    const done = await makePlan(user);
    await complete(user, done.id);
    const open = await makePlan(user);
    await cancel(user, open.id);

    expect((await cancel(user, done.id)).status).toBe(422);
    expect((await patch(user, open.id, { name: "x" })).status).toBe(422);
    expect((await complete(user, open.id)).status).toBe(422);
  });

  it("404 for another user's plan and 401 without a token", async () => {
    const owner = await newUser();
    const intruder = await newUser();
    const plan = await makePlan(owner);

    expect((await cancel(intruder, plan.id)).status).toBe(404);
    expect((await cancel(undefined as unknown as User, plan.id)).status).toBe(401);
    expect((await oneTimeRow(plan.id)).status).toBe("PLANNED");
  });
});
