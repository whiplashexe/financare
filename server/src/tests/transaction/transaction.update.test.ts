import { afterAll, describe, expect, it } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { transactions } from "../../db/schema/transactions.js";
import {
  createUser,
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
    initial_balance: 100_000,
    ...body,
  });
  return (await res.json()).data as Record<string, any>;
};

const categoryId = async (user: User, name: string, type: "INCOME" | "OUTCOME") => {
  const json = await (await call("GET", `/categories?type=${type}`, user)).json();
  return json.data.find((c: any) => c.name === name).id as string;
};

const record = async (user: User, accountId: string, extra: Record<string, unknown> = {}) => {
  const res = await call("POST", "/transactions", user, {
    type: "OUTCOME",
    name: "Groceries",
    amount: 10_000,
    account_id: accountId,
    ...extra,
  });
  return (await res.json()).data.transaction as Record<string, any>;
};

const patch = (user: User, id: string, body: unknown) =>
  call("PATCH", `/transactions/${id}`, user, body);

const balanceOf = async (user: User, accountId: string) =>
  (await (await call("GET", `/accounts/${accountId}`, user)).json()).data
    .current_balance as number;

afterAll(async () => {
  try {
    await deleteUsers(emails);
  } finally {
    server.close();
  }
});

describe("PATCH /transactions/:id: fields", () => {
  it("200: updates the given fields only and returns the transaction, balances and warnings", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const created = await record(user, account.id, {
      note: "old",
      location: "Here",
      tags: ["a"],
    });

    const res = await patch(user, created.id, { name: "  Renamed  ", note: "new" });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.transaction).toEqual({
      ...created,
      name: "Renamed",
      note: "new",
    });
    expect(json.data.balances_after).toEqual({ [account.id]: 90_000 });
    expect(json.data.warnings).toEqual([]);
  });

  it("null clears location, note and category; an empty list clears tags", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const category = await categoryId(user, "Makanan", "OUTCOME");
    const created = await record(user, account.id, {
      note: "x",
      location: "y",
      tags: ["a", "b"],
      category_id: category,
    });

    const json = await (
      await patch(user, created.id, { note: null, location: null, tags: [], category_id: null })
    ).json();

    expect(json.data.transaction).toMatchObject({
      note: null,
      location: null,
      tags: [],
      category_id: null,
    });
  });

  it("normalises tags like create does", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const created = await record(user, account.id);

    const json = await (await patch(user, created.id, { tags: ["Food", " food ", "WORK"] })).json();

    expect(json.data.transaction.tags).toEqual(["food", "work"]);
  });

  it("changes the date, including to an earlier day", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const created = await record(user, account.id);

    const json = await (
      await patch(user, created.id, { date: "2026-10-01T10:00:00+07:00" })
    ).json();

    expect(json.data.transaction.date).toBe("2026-10-01T03:00:00.000Z");
  });

  it("changes the category to another of the same type", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const food = await categoryId(user, "Makanan", "OUTCOME");
    const bills = await categoryId(user, "Tagihan", "OUTCOME");
    const created = await record(user, account.id, { category_id: food });

    const json = await (await patch(user, created.id, { category_id: bills })).json();

    expect(json.data.transaction.category_id).toBe(bills);
  });

  it("links and unlinks a plan", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const planId = await insertRecurringPlan({ userId: user.userId, accountId: account.id });
    const created = await record(user, account.id);

    const linked = await (await patch(user, created.id, { plan_id: planId })).json();
    expect(linked.data.transaction.plan_id).toBe(planId);

    const cleared = await (await patch(user, created.id, { plan_id: null })).json();
    expect(cleared.data.transaction.plan_id).toBeNull();

    expect((await patch(user, created.id, { plan_id: "RPLAN999999" })).status).toBe(404);
  });
});

describe("PATCH /transactions/:id: balances", () => {
  it("a changed amount recalculates the balance", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const created = await record(user, account.id, { amount: 10_000 });

    const json = await (await patch(user, created.id, { amount: 25_000 })).json();

    expect(json.data.balances_after).toEqual({ [account.id]: 75_000 });
    expect(await balanceOf(user, account.id)).toBe(75_000);
  });

  it("moving to another account restores the old one and charges the new one", async () => {
    const user = await newUser();
    const first = await createAccount(user);
    const second = await createAccount(user, { initial_balance: 50_000 });
    const created = await record(user, first.id, { amount: 10_000 });

    const json = await (await patch(user, created.id, { account_id: second.id })).json();

    expect(json.data.balances_after).toEqual({
      [first.id]: 100_000,
      [second.id]: 40_000,
    });
    expect(json.data.transaction.account_id).toBe(second.id);
  });

  it("switching an outcome to an income flips its effect", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const created = await record(user, account.id, { amount: 10_000 });

    const json = await (await patch(user, created.id, { type: "INCOME" })).json();

    expect(json.data.transaction.type).toBe("INCOME");
    expect(json.data.balances_after).toEqual({ [account.id]: 110_000 });
  });

  it("warns when the edit overdraws an account, and not when it does not make it worse", async () => {
    const user = await newUser();
    const account = await createAccount(user, { initial_balance: 5000 });
    const created = await record(user, account.id, { amount: 1000 });

    const overdraw = await (await patch(user, created.id, { amount: 9000 })).json();
    expect(overdraw.data.balances_after[account.id]).toBe(-4000);
    expect(overdraw.data.warnings).toEqual([
      { code: "NEGATIVE_BALANCE", account_id: account.id, balance_after: -4000 },
    ]);

    const harmless = await (await patch(user, created.id, { note: "still negative" })).json();
    expect(harmless.data.balances_after[account.id]).toBe(-4000);
    expect(harmless.data.warnings).toEqual([]);

    const better = await (await patch(user, created.id, { amount: 8000 })).json();
    expect(better.data.warnings).toEqual([]);
  });

  it("two simultaneous edits are applied one after the other and leave a consistent balance", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const created = await record(user, account.id, { amount: 1000 });

    const [a, b] = await Promise.all([
      patch(user, created.id, { amount: 2000 }),
      patch(user, created.id, { amount: 3000 }),
    ]);

    expect([a.status, b.status]).toEqual([200, 200]);
    const rows = await transactionRows(user.userId);
    expect([2000, 3000]).toContain(rows[0]!.amount);
    expect(await balanceOf(user, account.id)).toBe(100_000 - rows[0]!.amount);
  });
});

describe("PATCH /transactions/:id: transfers and the admin fee", () => {
  const transfer = async (
    user: User,
    source: Record<string, any>,
    target: Record<string, any>,
    extra: Record<string, unknown> = {},
  ) =>
    record(user, source.id, {
      type: "TRANSFER",
      name: "Move",
      amount: 20_000,
      to_account_id: target.id,
      admin_fee: 1000,
      date: "2026-10-10T03:00:00Z",
      ...extra,
    });

  const feeRow = async (user: User) =>
    (await transactionRows(user.userId)).find((t) => t.parentTransactionId !== null);

  it("a changed amount and destination recalculate all three balances", async () => {
    const user = await newUser();
    const source = await createAccount(user);
    const target = await createAccount(user);
    const other = await createAccount(user);
    const created = await transfer(user, source, target);

    const json = await (
      await patch(user, created.id, { amount: 30_000, to_account_id: other.id })
    ).json();

    expect(json.data.balances_after).toEqual({
      [source.id]: 100_000 - 30_000 - 1000,
      [target.id]: 100_000,
      [other.id]: 130_000,
    });
  });

  it("changing the admin fee updates the linked outcome", async () => {
    const user = await newUser();
    const source = await createAccount(user);
    const target = await createAccount(user);
    const created = await transfer(user, source, target);

    const json = await (await patch(user, created.id, { admin_fee: 2500 })).json();

    expect(json.data.transaction.admin_fee).toBe(2500);
    expect(json.data.balances_after[source.id]).toBe(100_000 - 20_000 - 2500);
    expect((await feeRow(user))!.amount).toBe(2500);
    expect((await transactionRows(user.userId))).toHaveLength(2);
  });

  it("an admin fee of 0 removes the linked outcome, and a new fee creates it again", async () => {
    const user = await newUser();
    const source = await createAccount(user);
    const target = await createAccount(user);
    const created = await transfer(user, source, target);

    await patch(user, created.id, { admin_fee: 0 });
    expect(await feeRow(user)).toBeUndefined();
    expect(await balanceOf(user, source.id)).toBe(80_000);

    const json = await (await patch(user, created.id, { admin_fee: 700 })).json();
    expect(json.data.transaction.admin_fee).toBe(700);
    expect((await feeRow(user))!.amount).toBe(700);
  });

  it("the fee follows the transfer's name, date and source account", async () => {
    const user = await newUser();
    const source = await createAccount(user);
    const newSource = await createAccount(user);
    const target = await createAccount(user);
    const created = await transfer(user, source, target);

    await patch(user, created.id, {
      name: "Renamed move",
      date: "2026-10-05T00:00:00Z",
      account_id: newSource.id,
    });

    const fee = (await feeRow(user))!;
    expect(fee.name).toBe("Biaya admin: Renamed move");
    expect(fee.date.toISOString()).toBe("2026-10-05T00:00:00.000Z");
    expect(fee.accountId).toBe(newSource.id);
    expect(fee.parentTransactionId).toBe(created.id);
  });

  it("converting an outcome into a transfer needs a destination and creates the fee", async () => {
    const user = await newUser();
    const source = await createAccount(user);
    const target = await createAccount(user);
    const category = await categoryId(user, "Makanan", "OUTCOME");
    const created = await record(user, source.id, { amount: 10_000, category_id: category });

    const missing = await patch(user, created.id, { type: "TRANSFER", category_id: null });
    expect(missing.status).toBe(400);
    expect(Object.keys((await missing.json()).errors)).toContain("to_account_id");

    const keepsCategory = await patch(user, created.id, { type: "TRANSFER", to_account_id: target.id });
    expect(keepsCategory.status).toBe(400);
    expect(Object.keys((await keepsCategory.json()).errors)).toContain("category_id");

    const ok = await patch(user, created.id, {
      type: "TRANSFER",
      to_account_id: target.id,
      category_id: null,
      admin_fee: 500,
    });
    const json = await ok.json();
    expect(ok.status).toBe(200);
    expect(json.data.transaction).toMatchObject({
      type: "TRANSFER",
      to_account_id: target.id,
      category_id: null,
      admin_fee: 500,
    });
    expect(json.data.balances_after).toEqual({
      [source.id]: 100_000 - 10_000 - 500,
      [target.id]: 110_000,
    });
  });

  it("converting a transfer back into an outcome removes the destination and the fee", async () => {
    const user = await newUser();
    const source = await createAccount(user);
    const target = await createAccount(user);
    const created = await transfer(user, source, target);

    const stillDestination = await patch(user, created.id, { type: "OUTCOME" });
    expect(stillDestination.status).toBe(400);

    const ok = await patch(user, created.id, { type: "OUTCOME", to_account_id: null });
    const json = await ok.json();
    expect(ok.status).toBe(200);
    expect(json.data.transaction).toMatchObject({
      type: "OUTCOME",
      to_account_id: null,
      admin_fee: null,
    });
    expect(await feeRow(user)).toBeUndefined();
    expect(json.data.balances_after).toEqual({
      [source.id]: 80_000,
      [target.id]: 100_000,
    });
  });

  it("400: same source and destination, category, items and a fee on a non-transfer", async () => {
    const user = await newUser();
    const source = await createAccount(user);
    const target = await createAccount(user);
    const created = await transfer(user, source, target);
    const plain = await record(user, source.id);
    const category = await categoryId(user, "Makanan", "OUTCOME");

    expect((await patch(user, created.id, { to_account_id: source.id })).status).toBe(400);
    expect((await patch(user, created.id, { account_id: target.id })).status).toBe(400);
    expect((await patch(user, created.id, { category_id: category })).status).toBe(400);
    expect((await patch(user, created.id, { items: [{ name: "x", total_price: 1 }] })).status).toBe(400);
    expect((await patch(user, plain.id, { admin_fee: 100 })).status).toBe(400);
    expect((await patch(user, plain.id, { to_account_id: target.id })).status).toBe(400);
  });

  it("a transfer cannot be turned from an outcome that still has items unless they are cleared", async () => {
    const user = await newUser();
    const source = await createAccount(user);
    const target = await createAccount(user);
    const created = await record(user, source.id, { items: [{ name: "x", total_price: 5 }] });

    const blocked = await patch(user, created.id, { type: "TRANSFER", to_account_id: target.id });
    expect(blocked.status).toBe(400);
    expect(Object.keys((await blocked.json()).errors)).toContain("items");

    const ok = await patch(user, created.id, {
      type: "TRANSFER",
      to_account_id: target.id,
      items: [],
    });
    expect(ok.status).toBe(200);
  });
});

describe("PATCH /transactions/:id: items", () => {
  it("replaces the whole list, an empty list removes all, and omitting leaves them alone", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const created = await record(user, account.id, {
      items: [
        { name: "A", total_price: 1 },
        { name: "B", total_price: 2 },
      ],
    });

    const untouched = await (await patch(user, created.id, { note: "x" })).json();
    expect(untouched.data.transaction.items).toHaveLength(2);

    const replaced = await (
      await patch(user, created.id, {
        items: [{ name: "C", quantity: 2.5, unit: "kg", total_price: 30 }],
      })
    ).json();
    expect(replaced.data.transaction.items).toEqual([
      { name: "C", quantity: 2.5, unit: "kg", total_price: 30 },
    ]);
    expect(replaced.data.transaction.items_total).toBe(30);

    const cleared = await (await patch(user, created.id, { items: [] })).json();
    expect(cleared.data.transaction.items).toEqual([]);
    expect(cleared.data.transaction.items_total).toBe(0);
  });

  it("the items do not change the amount or the balance", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const created = await record(user, account.id, { amount: 10_000 });

    await patch(user, created.id, { items: [{ name: "Huge", total_price: 999_999 }] });

    expect(await balanceOf(user, account.id)).toBe(90_000);
  });

  it("400 for invalid items, and the old items stay", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const created = await record(user, account.id, { items: [{ name: "Keep", total_price: 1 }] });

    expect((await patch(user, created.id, { items: [{ name: "", total_price: 1 }] })).status).toBe(400);
    expect(
      (await patch(user, created.id, { items: Array.from({ length: 101 }, () => ({ name: "x", total_price: 1 })) })).status,
    ).toBe(400);

    const detail = await (await call("GET", `/transactions/${created.id}`, user)).json();
    expect(detail.data.items).toEqual([{ name: "Keep", quantity: 1, unit: null, total_price: 1 }]);
  });
});

describe("PATCH /transactions/:id: rules", () => {
  it("422 for a future date, and nothing changes", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const created = await record(user, account.id);
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const res = await patch(user, created.id, { date: tomorrow, name: "Changed" });

    expect(res.status).toBe(422);
    expect((await res.json()).code).toBe("BUSINESS_RULE");
    const detail = await (await call("GET", `/transactions/${created.id}`, user)).json();
    expect(detail.data.name).toBe("Groceries");
  });

  it("422 when moving to an archived account, 404 for a foreign or unknown one", async () => {
    const user = await newUser();
    const other = await newUser();
    const account = await createAccount(user);
    const archived = await createAccount(user);
    await call("POST", `/accounts/${archived.id}/archive`, user);
    const foreign = await createAccount(other);
    const created = await record(user, account.id);

    expect((await patch(user, created.id, { account_id: archived.id })).status).toBe(422);
    expect((await patch(user, created.id, { account_id: foreign.id })).status).toBe(404);
    expect((await patch(user, created.id, { account_id: "ACC999999" })).status).toBe(404);
  });

  it("editing other fields is allowed while the account is archived", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const created = await record(user, account.id);
    await call("POST", `/accounts/${account.id}/archive`, user);

    const res = await patch(user, created.id, { note: "still editable" });

    expect(res.status).toBe(200);
  });

  it("400 for a category of the wrong type, 404 for a foreign one", async () => {
    const user = await newUser();
    const other = await newUser();
    const account = await createAccount(user);
    const created = await record(user, account.id);
    const income = await categoryId(user, "Gaji", "INCOME");
    const foreign = await categoryId(other, "Makanan", "OUTCOME");

    const mismatch = await patch(user, created.id, { category_id: income });
    expect(mismatch.status).toBe(400);
    expect(Object.keys((await mismatch.json()).errors)).toContain("category_id");
    expect((await patch(user, created.id, { category_id: foreign })).status).toBe(404);
  });

  it("changing the type needs a matching category", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const food = await categoryId(user, "Makanan", "OUTCOME");
    const created = await record(user, account.id, { category_id: food });

    expect((await patch(user, created.id, { type: "INCOME" })).status).toBe(400);
    expect((await patch(user, created.id, { type: "INCOME", category_id: null })).status).toBe(200);
  });

  it("400: empty body and invalid values", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const created = await record(user, account.id);

    expect((await patch(user, created.id, {})).status).toBe(400);
    expect((await patch(user, created.id, { amount: 0 })).status).toBe(400);
    expect((await patch(user, created.id, { amount: 1.5 })).status).toBe(400);
    expect((await patch(user, created.id, { name: "" })).status).toBe(400);
    expect((await patch(user, created.id, { name: "n".repeat(101) })).status).toBe(400);
    expect((await patch(user, created.id, { date: "2026-11-13T03:20:00" })).status).toBe(400);
    expect((await patch(user, created.id, { date: null })).status).toBe(400);
    expect((await patch(user, created.id, { note: "n".repeat(1001) })).status).toBe(400);
    expect((await patch(user, created.id, { tags: Array.from({ length: 11 }, (_, i) => `t${i}`) })).status).toBe(400);
  });

  it("400: fields that cannot be edited here", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const created = await record(user, account.id);

    for (const body of [
      { user_id: "USR001" },
      { source: "AUTO" },
      { deleted_at: "2026-01-01T00:00:00Z" },
      { parent_transaction_id: "TRANS001" },
      { template_id: "TPL001" },
      { images: [] },
      { id: "TRANS999" },
    ]) {
      expect((await patch(user, created.id, body)).status).toBe(400);
    }
  });

  it("422 when editing an admin fee directly", async () => {
    const user = await newUser();
    const source = await createAccount(user);
    const target = await createAccount(user);
    await record(user, source.id, {
      type: "TRANSFER",
      name: "Move",
      to_account_id: target.id,
      admin_fee: 1000,
    });
    const fee = (await transactionRows(user.userId)).find((t) => t.parentTransactionId)!;

    const res = await patch(user, fee.id, { amount: 5000 });

    expect(res.status).toBe(422);
    expect((await res.json()).code).toBe("BUSINESS_RULE");
  });

  it("404 for a trashed, foreign, or unknown transaction", async () => {
    const owner = await newUser();
    const intruder = await newUser();
    const account = await createAccount(owner);
    const created = await record(owner, account.id);
    const trashed = await record(owner, account.id);
    await db.update(transactions).set({ deletedAt: new Date() }).where(eq(transactions.id, trashed.id));

    const foreign = await patch(intruder, created.id, { name: "Hacked" });
    const unknown = await patch(intruder, "TRANS999999", { name: "Hacked" });

    expect(foreign.status).toBe(404);
    expect(await foreign.json()).toEqual(await unknown.json());
    expect((await patch(owner, trashed.id, { name: "x" })).status).toBe(404);
    const detail = await (await call("GET", `/transactions/${created.id}`, owner)).json();
    expect(detail.data.name).toBe("Groceries");
  });

  it("401 without a token", async () => {
    expect((await patch(undefined as unknown as User, "TRANS001", { name: "x" })).status).toBe(401);
  });
});
