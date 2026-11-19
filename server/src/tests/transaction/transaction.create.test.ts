import { afterAll, describe, expect, it } from "bun:test";
import { and, eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { idempotencyKeys } from "../../db/schema/idempotency.keys.js";
import { transactions } from "../../db/schema/transactions.js";
import {
  createUser,
  deleteUsers,
  insertRecurringPlan,
  insertTemplate,
  startServer,
  templateRow,
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

const createAccount = async (
  user: User,
  body: Record<string, unknown> = {},
) => {
  const res = await call("POST", "/accounts", user, {
    name: `Account ${crypto.randomUUID().slice(0, 8)}`,
    type: "BANK",
    ...body,
  });
  return (await res.json()).data as Record<string, any>;
};

const categoryId = async (
  user: User,
  name: string,
  type: "INCOME" | "OUTCOME",
) => {
  const json = await (await call("GET", `/categories?type=${type}`, user)).json();
  return json.data.find((c: any) => c.name === name).id as string;
};

const create = (user: User, body: unknown, headers?: Record<string, string>) =>
  call("POST", "/transactions", user, body, headers);

const outcome = (accountId: string, extra: Record<string, unknown> = {}) => ({
  type: "OUTCOME",
  name: "Groceries",
  amount: 1000,
  account_id: accountId,
  ...extra,
});

afterAll(async () => {
  try {
    await deleteUsers(emails);
  } finally {
    server.close();
  }
});

describe("POST /transactions: outcome and income", () => {
  it("201: records an outcome and returns the balance after it", async () => {
    const user = await newUser();
    const account = await createAccount(user, { initial_balance: 100_000 });

    const res = await create(user, outcome(account.id, { amount: 25_000 }));
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.success).toBe(true);
    expect(json.data.account_balance_after).toBe(75_000);
    expect(json.data.warnings).toEqual([]);
    expect(json.data.transaction).toMatchObject({
      id: expect.stringMatching(/^TRANS\d{3,}$/),
      type: "OUTCOME",
      name: "Groceries",
      amount: 25_000,
      account_id: account.id,
      to_account_id: null,
      admin_fee: null,
      category_id: null,
      parent_transaction_id: null,
      plan_id: null,
      location: null,
      note: null,
      tags: [],
      source: "MANUAL",
      items: [],
      items_total: 0,
      images: [],
    });

    const detail = await (await call("GET", `/accounts/${account.id}`, user)).json();
    expect(detail.data.current_balance).toBe(75_000);
  });

  it("201: an income increases the balance", async () => {
    const user = await newUser();
    const account = await createAccount(user, { initial_balance: 1000 });

    const json = await (
      await create(user, { type: "INCOME", name: "Salary", amount: 5000, account_id: account.id })
    ).json();

    expect(json.data.account_balance_after).toBe(6000);
    expect(json.data.warnings).toEqual([]);
  });

  it("defaults the date to now", async () => {
    const user = await newUser();
    const account = await createAccount(user);

    const json = await (await create(user, outcome(account.id))).json();

    const age = Date.now() - new Date(json.data.transaction.date).getTime();
    expect(Math.abs(age)).toBeLessThan(60_000);
  });

  it("accepts a past date with an offset and returns it as the same UTC instant", async () => {
    const user = await newUser();
    const account = await createAccount(user);

    const json = await (
      await create(user, outcome(account.id, { date: "2026-11-13T10:20:00+08:00" }))
    ).json();

    expect(json.data.transaction.date).toBe("2026-11-13T02:20:00.000Z");
  });

  it("stores every optional field, normalises tags, and keeps item order", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const category = await categoryId(user, "Makanan", "OUTCOME");

    const res = await create(
      user,
      outcome(account.id, {
        name: "  Monthly groceries  ",
        category_id: category,
        location: "Indomaret Sanur",
        note: "Soap, rice",
        tags: ["Monthly", " monthly ", "FOOD"],
        items: [
          { name: "Rice", quantity: 2.5, unit: "kg", total_price: 30_000 },
          { name: "Soap", total_price: 5000 },
          { name: "Bag", unit: "   ", total_price: 0 },
        ],
      }),
    );
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.data.transaction).toMatchObject({
      name: "Monthly groceries",
      category_id: category,
      location: "Indomaret Sanur",
      note: "Soap, rice",
      tags: ["monthly", "food"],
      items_total: 35_000,
    });
    expect(json.data.transaction.items).toEqual([
      { name: "Rice", quantity: 2.5, unit: "kg", total_price: 30_000 },
      { name: "Soap", quantity: 1, unit: null, total_price: 5000 },
      { name: "Bag", quantity: 1, unit: null, total_price: 0 },
    ]);
  });

  it("items are informational: the amount and balance do not change", async () => {
    const user = await newUser();
    const account = await createAccount(user, { initial_balance: 10_000 });

    const json = await (
      await create(
        user,
        outcome(account.id, {
          amount: 2000,
          items: [{ name: "Big item", total_price: 999_999 }],
        }),
      )
    ).json();

    expect(json.data.account_balance_after).toBe(8000);
    expect(json.data.transaction.amount).toBe(2000);
    expect(json.data.transaction.items_total).toBe(999_999);
  });

  it("accepts the maximum amount and 100 items", async () => {
    const user = await newUser();
    const account = await createAccount(user);

    const big = await create(user, outcome(account.id, { amount: 999_999_999_999 }));
    expect(big.status).toBe(201);

    const items = Array.from({ length: 100 }, (_, i) => ({ name: `Item ${i}`, total_price: i }));
    const many = await create(user, outcome(account.id, { items }));
    expect(many.status).toBe(201);
    expect((await many.json()).data.transaction.items).toHaveLength(100);
  });

  it("warns NEGATIVE_BALANCE when an outcome overdraws the account, but still records it", async () => {
    const user = await newUser();
    const account = await createAccount(user, { initial_balance: 1000 });

    const res = await create(user, outcome(account.id, { amount: 5000 }));
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.data.account_balance_after).toBe(-4000);
    expect(json.data.warnings).toEqual([
      { code: "NEGATIVE_BALANCE", account_id: account.id, balance_after: -4000 },
    ]);
  });

  it("no warning for an income, even if the balance stays negative", async () => {
    const user = await newUser();
    const account = await createAccount(user, { initial_balance: -10_000 });

    const json = await (
      await create(user, { type: "INCOME", name: "Refund", amount: 500, account_id: account.id })
    ).json();

    expect(json.data.account_balance_after).toBe(-9500);
    expect(json.data.warnings).toEqual([]);
  });

  it("a recurring plan can be linked with plan_id", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const planId = await insertRecurringPlan({ userId: user.userId, accountId: account.id });

    const json = await (await create(user, outcome(account.id, { plan_id: planId }))).json();

    expect(json.data.transaction.plan_id).toBe(planId);
  });

  it("template_id increments the template use count and is not stored", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const templateId = await insertTemplate({ userId: user.userId });

    const json = await (await create(user, outcome(account.id, { template_id: templateId }))).json();

    const row = await templateRow(templateId);
    expect(row.useCount).toBe(1);
    expect(row.lastUsedAt).not.toBeNull();
    expect(json.data.transaction.template_id).toBeUndefined();
  });
});

describe("POST /transactions: transfer", () => {
  it("201: moves money and returns both balances", async () => {
    const user = await newUser();
    const source = await createAccount(user, { initial_balance: 100_000 });
    const target = await createAccount(user, { initial_balance: 5000 });

    const res = await create(user, {
      type: "TRANSFER",
      name: "Top up",
      amount: 40_000,
      account_id: source.id,
      to_account_id: target.id,
    });
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.data.account_balance_after).toBeUndefined();
    expect(json.data.balances_after).toEqual({
      [source.id]: 60_000,
      [target.id]: 45_000,
    });
    expect(json.data.transaction).toMatchObject({
      type: "TRANSFER",
      account_id: source.id,
      to_account_id: target.id,
      admin_fee: 0,
      category_id: null,
    });
  });

  it("records the admin fee as a linked outcome in the Biaya Admin category", async () => {
    const user = await newUser();
    const source = await createAccount(user, { initial_balance: 100_000 });
    const target = await createAccount(user, { initial_balance: 0 });
    const feeCategory = await categoryId(user, "Biaya Admin", "OUTCOME");

    const json = await (
      await create(user, {
        type: "TRANSFER",
        name: "Top up",
        amount: 40_000,
        admin_fee: 2500,
        account_id: source.id,
        to_account_id: target.id,
        date: "2026-11-10T03:00:00Z",
      })
    ).json();

    expect(json.data.balances_after).toEqual({
      [source.id]: 57_500,
      [target.id]: 40_000,
    });
    expect(json.data.transaction.admin_fee).toBe(2500);

    const rows = await transactionRows(user.userId);
    const parent = rows.find((r) => r.type === "TRANSFER")!;
    const fee = rows.find((r) => r.type === "OUTCOME")!;
    expect(rows).toHaveLength(2);
    expect(fee.parentTransactionId).toBe(parent.id);
    expect(fee.amount).toBe(2500);
    expect(fee.accountId).toBe(source.id);
    expect(fee.categoryId).toBe(feeCategory);
    expect(fee.date.getTime()).toBe(parent.date.getTime());
    expect(fee.name).toBe("Biaya admin: Top up");
  });

  it("an admin fee of 0 or no fee creates no extra row", async () => {
    const user = await newUser();
    const source = await createAccount(user, { initial_balance: 10_000 });
    const target = await createAccount(user);
    const base = { type: "TRANSFER", name: "Move", amount: 1000, account_id: source.id, to_account_id: target.id };

    await create(user, { ...base, admin_fee: 0 });
    await create(user, base);

    expect(await transactionRows(user.userId)).toHaveLength(2);
  });

  it("warns for the source account when the transfer and fee overdraw it", async () => {
    const user = await newUser();
    const source = await createAccount(user, { initial_balance: 1000 });
    const target = await createAccount(user);

    const json = await (
      await create(user, {
        type: "TRANSFER",
        name: "Too much",
        amount: 1000,
        admin_fee: 500,
        account_id: source.id,
        to_account_id: target.id,
      })
    ).json();

    expect(json.data.balances_after[source.id]).toBe(-500);
    expect(json.data.warnings).toEqual([
      { code: "NEGATIVE_BALANCE", account_id: source.id, balance_after: -500 },
    ]);
  });

  it("400: missing destination, same source and destination, category, items", async () => {
    const user = await newUser();
    const source = await createAccount(user);
    const target = await createAccount(user);
    const category = await categoryId(user, "Makanan", "OUTCOME");
    const base = { type: "TRANSFER", name: "Move", amount: 1000, account_id: source.id };

    const noDestination = await create(user, base);
    expect(noDestination.status).toBe(400);
    expect(Object.keys((await noDestination.json()).errors)).toContain("to_account_id");

    expect((await create(user, { ...base, to_account_id: source.id })).status).toBe(400);
    expect((await create(user, { ...base, to_account_id: target.id, category_id: category })).status).toBe(400);
    expect(
      (await create(user, { ...base, to_account_id: target.id, items: [{ name: "x", total_price: 1 }] })).status,
    ).toBe(400);
  });

  it("an empty items list is allowed on a transfer", async () => {
    const user = await newUser();
    const source = await createAccount(user);
    const target = await createAccount(user);

    const res = await create(user, {
      type: "TRANSFER",
      name: "Move",
      amount: 1000,
      account_id: source.id,
      to_account_id: target.id,
      items: [],
    });

    expect(res.status).toBe(201);
  });

  it("400: income and outcome cannot have a destination or an admin fee", async () => {
    const user = await newUser();
    const source = await createAccount(user);
    const target = await createAccount(user);

    expect((await create(user, outcome(source.id, { to_account_id: target.id }))).status).toBe(400);
    expect((await create(user, outcome(source.id, { admin_fee: 100 }))).status).toBe(400);
  });

  it("422 when the destination is archived", async () => {
    const user = await newUser();
    const source = await createAccount(user);
    const target = await createAccount(user);
    await call("POST", `/accounts/${target.id}/archive`, user);

    const res = await create(user, {
      type: "TRANSFER",
      name: "Move",
      amount: 1000,
      account_id: source.id,
      to_account_id: target.id,
    });

    expect(res.status).toBe(422);
  });

  it("404 when the destination belongs to another user", async () => {
    const user = await newUser();
    const other = await newUser();
    const source = await createAccount(user);
    const foreign = await createAccount(other);

    const res = await create(user, {
      type: "TRANSFER",
      name: "Move",
      amount: 1000,
      account_id: source.id,
      to_account_id: foreign.id,
    });

    expect(res.status).toBe(404);
  });
});

describe("POST /transactions: validation and business rules", () => {
  it("400: invalid amount", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const withAmount = (amount: unknown) => create(user, outcome(account.id, { amount }));

    for (const amount of [0, -5, 1.5, "100", null, 1_000_000_000_000]) {
      expect((await withAmount(amount)).status).toBe(400);
    }
    const json = await (await withAmount(0)).json();
    expect(json.code).toBe("VALIDATION_ERROR");
    expect(Object.keys(json.errors)).toContain("amount");
  });

  it("400: invalid name, type, and missing required fields", async () => {
    const user = await newUser();
    const account = await createAccount(user);

    expect((await create(user, outcome(account.id, { name: "" }))).status).toBe(400);
    expect((await create(user, outcome(account.id, { name: "   " }))).status).toBe(400);
    expect((await create(user, outcome(account.id, { name: "n".repeat(101) }))).status).toBe(400);
    expect((await create(user, outcome(account.id, { type: "REFUND" }))).status).toBe(400);
    expect((await create(user, { type: "OUTCOME", name: "x", amount: 1 })).status).toBe(400);
    expect((await create(user, { name: "x", amount: 1, account_id: account.id })).status).toBe(400);
    expect((await create(user, {})).status).toBe(400);
    expect((await call("POST", "/transactions", user)).status).toBe(400);
  });

  it("400: invalid tags, note, location", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const send = (extra: Record<string, unknown>) => create(user, outcome(account.id, extra));

    const eleven = Array.from({ length: 11 }, (_, i) => `tag${i}`);
    expect((await send({ tags: eleven })).status).toBe(400);
    expect((await send({ tags: ["t".repeat(31)] })).status).toBe(400);
    expect((await send({ tags: [""] })).status).toBe(400);
    expect((await send({ note: "n".repeat(1001) })).status).toBe(400);
    expect((await send({ location: "l".repeat(256) })).status).toBe(400);

    expect((await send({ tags: ["Same", "same", "SAME"] })).status).toBe(201);
    expect((await send({ note: "n".repeat(1000), location: "l".repeat(255) })).status).toBe(201);
  });

  it("400: invalid items", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const send = (items: unknown) => create(user, outcome(account.id, { items }));

    expect((await send(Array.from({ length: 101 }, () => ({ name: "x", total_price: 1 })))).status).toBe(400);
    expect((await send([{ name: "", total_price: 1 }])).status).toBe(400);
    expect((await send([{ name: "x", total_price: -1 }])).status).toBe(400);
    expect((await send([{ name: "x", total_price: 1.5 }])).status).toBe(400);
    expect((await send([{ name: "x", quantity: 0, total_price: 1 }])).status).toBe(400);
    expect((await send([{ name: "x", quantity: 1.2345, total_price: 1 }])).status).toBe(400);
    expect((await send([{ name: "x", unit: "u".repeat(21), total_price: 1 }])).status).toBe(400);
    expect((await send([{ name: "x", total_price: 1, price: 5 }])).status).toBe(400);
    expect((await send([{ name: "x", quantity: 0.001, total_price: 1 }])).status).toBe(201);
  });

  it("400: fields the client may not set, including images for now", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const send = (extra: Record<string, unknown>) => create(user, outcome(account.id, extra));

    expect((await send({ user_id: "USR001" })).status).toBe(400);
    expect((await send({ source: "AUTO" })).status).toBe(400);
    expect((await send({ deleted_at: "2026-01-01T00:00:00Z" })).status).toBe(400);
    expect((await send({ parent_transaction_id: "TRANS001" })).status).toBe(400);
    expect((await send({ images: [] })).status).toBe(400);
  });

  it("400: malformed dates", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const send = (date: unknown) => create(user, outcome(account.id, { date }));

    expect((await send("not-a-date")).status).toBe(400);
    expect((await send("2026-13-45T00:00:00Z")).status).toBe(400);
    expect((await send("2026-11-13T03:20:00")).status).toBe(400);
    expect((await send(1731468000)).status).toBe(400);
  });

  it("422 BUSINESS_RULE for a future date, nothing is recorded", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const res = await create(user, outcome(account.id, { date: tomorrow }));
    const json = await res.json();

    expect(res.status).toBe(422);
    expect(json.code).toBe("BUSINESS_RULE");
    expect(await transactionRows(user.userId)).toHaveLength(0);
  });

  it("422 for an archived account, 404 for an unknown or foreign account", async () => {
    const user = await newUser();
    const other = await newUser();
    const archived = await createAccount(user);
    await call("POST", `/accounts/${archived.id}/archive`, user);
    const foreign = await createAccount(other);

    expect((await create(user, outcome(archived.id))).status).toBe(422);
    expect((await create(user, outcome(foreign.id))).status).toBe(404);
    expect((await create(user, outcome("ACC999999"))).status).toBe(404);
  });

  it("category: must belong to the user and match the type", async () => {
    const user = await newUser();
    const other = await newUser();
    const account = await createAccount(user);
    const income = await categoryId(user, "Gaji", "INCOME");
    const foreign = await categoryId(other, "Makanan", "OUTCOME");

    const mismatch = await create(user, outcome(account.id, { category_id: income }));
    expect(mismatch.status).toBe(400);
    expect(Object.keys((await mismatch.json()).errors)).toContain("category_id");

    expect((await create(user, outcome(account.id, { category_id: foreign }))).status).toBe(404);
    expect((await create(user, outcome(account.id, { category_id: "CAT999999" }))).status).toBe(404);
    expect((await create(user, outcome(account.id, { category_id: null }))).status).toBe(201);
  });

  it("404 for an unknown plan_id or template_id", async () => {
    const user = await newUser();
    const account = await createAccount(user);

    expect((await create(user, outcome(account.id, { plan_id: "RPLAN999999" }))).status).toBe(404);
    expect((await create(user, outcome(account.id, { template_id: "TPL999999" }))).status).toBe(404);
  });

  it("a rejected request leaves no trace", async () => {
    const user = await newUser();
    const account = await createAccount(user, { initial_balance: 5000 });
    const templateId = await insertTemplate({ userId: user.userId });

    await create(user, outcome(account.id, { template_id: templateId, plan_id: "RPLAN999999" }));

    expect(await transactionRows(user.userId)).toHaveLength(0);
    expect((await templateRow(templateId)).useCount).toBe(0);
  });

  it("401 without a token", async () => {
    expect((await call("POST", "/transactions", undefined, {})).status).toBe(401);
  });
});

describe("POST /transactions: Idempotency-Key", () => {
  it("a repeated key returns the first result and does not record twice", async () => {
    const user = await newUser();
    const account = await createAccount(user, { initial_balance: 10_000 });
    const key = crypto.randomUUID();
    const body = outcome(account.id, { amount: 3000 });

    const first = await create(user, body, { "idempotency-key": key });
    const second = await create(user, body, { "idempotency-key": key });

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(first.headers.get("idempotent-replayed")).toBeNull();
    expect(second.headers.get("idempotent-replayed")).toBe("true");
    expect((await second.json()).data).toEqual((await first.json()).data);

    expect(await transactionRows(user.userId)).toHaveLength(1);
    const detail = await (await call("GET", `/accounts/${account.id}`, user)).json();
    expect(detail.data.current_balance).toBe(7000);
  });

  it("a different key records a new transaction", async () => {
    const user = await newUser();
    const account = await createAccount(user);

    await create(user, outcome(account.id), { "idempotency-key": crypto.randomUUID() });
    await create(user, outcome(account.id), { "idempotency-key": crypto.randomUUID() });

    expect(await transactionRows(user.userId)).toHaveLength(2);
  });

  it("without a key, repeating the request records twice", async () => {
    const user = await newUser();
    const account = await createAccount(user);

    await create(user, outcome(account.id));
    await create(user, outcome(account.id));

    expect(await transactionRows(user.userId)).toHaveLength(2);
  });

  it("the same key of two users is independent", async () => {
    const first = await newUser();
    const second = await newUser();
    const key = crypto.randomUUID();
    const a = await createAccount(first);
    const b = await createAccount(second);

    const one = await create(first, outcome(a.id), { "idempotency-key": key });
    const two = await create(second, outcome(b.id), { "idempotency-key": key });

    expect(one.status).toBe(201);
    expect(two.status).toBe(201);
    expect(two.headers.get("idempotent-replayed")).toBeNull();
    expect(await transactionRows(second.userId)).toHaveLength(1);
  });

  it("two simultaneous requests with the same key record exactly one transaction", async () => {
    const user = await newUser();
    const account = await createAccount(user, { initial_balance: 10_000 });
    const key = crypto.randomUUID();
    const body = outcome(account.id, { amount: 1000 });

    const [a, b] = await Promise.all([
      create(user, body, { "idempotency-key": key }),
      create(user, body, { "idempotency-key": key }),
    ]);

    expect([a.status, b.status]).toEqual([201, 201]);
    const idA = (await a.json()).data.transaction.id;
    const idB = (await b.json()).data.transaction.id;
    expect(idA).toBe(idB);
    expect(await transactionRows(user.userId)).toHaveLength(1);
  });

  it("a failed request does not consume the key", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const key = crypto.randomUUID();

    const failed = await create(user, outcome("ACC999999"), { "idempotency-key": key });
    const retried = await create(user, outcome(account.id), { "idempotency-key": key });

    expect(failed.status).toBe(404);
    expect(retried.status).toBe(201);
    expect(retried.headers.get("idempotent-replayed")).toBeNull();
  });

  it("a key older than 24 hours is no longer replayed", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const key = crypto.randomUUID();

    await create(user, outcome(account.id), { "idempotency-key": key });
    await db
      .update(idempotencyKeys)
      .set({ createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000) })
      .where(and(eq(idempotencyKeys.userId, user.userId), eq(idempotencyKeys.key, key)));

    const again = await create(user, outcome(account.id), { "idempotency-key": key });

    expect(again.status).toBe(201);
    expect(again.headers.get("idempotent-replayed")).toBeNull();
    expect(await transactionRows(user.userId)).toHaveLength(2);
  });

  it("400 for an empty or too long key", async () => {
    const user = await newUser();
    const account = await createAccount(user);

    expect((await create(user, outcome(account.id), { "idempotency-key": "" })).status).toBe(400);
    expect(
      (await create(user, outcome(account.id), { "idempotency-key": "k".repeat(65) })).status,
    ).toBe(400);
    expect(
      (await create(user, outcome(account.id), { "idempotency-key": "k".repeat(64) })).status,
    ).toBe(201);
    expect(await db.select().from(transactions).where(eq(transactions.userId, user.userId))).toHaveLength(1);
  });
});
