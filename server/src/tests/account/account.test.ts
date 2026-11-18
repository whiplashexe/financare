import { afterAll, describe, expect, it } from "bun:test";
import {
  createUser,
  deleteUsers,
  insertRecurringPlan,
  insertTemplate,
  insertTransaction,
  startServer,
  templateRow,
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
) =>
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
    ...body,
  });
  const json = await res.json();
  return json.data as Record<string, any>;
};

afterAll(async () => {
  try {
    await deleteUsers(emails);
  } finally {
    server.close();
  }
});

describe("POST /accounts", () => {
  it("201: creates an account with defaults", async () => {
    const user = await newUser();

    const res = await call("POST", "/accounts", user, {
      name: "BCA Salary",
      type: "BANK",
    });
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.success).toBe(true);
    expect(json.data).toEqual({
      id: expect.stringMatching(/^ACC\d{3,}$/),
      name: "BCA Salary",
      type: "BANK",
      institution: null,
      initial_balance: 0,
      current_balance: 0,
      last4: null,
      color: null,
      icon: null,
      include_in_total: true,
      status: "ACTIVE",
    });
  });

  it("201: stores every optional field, trims the name, allows a negative initial balance", async () => {
    const user = await newUser();

    const res = await call("POST", "/accounts", user, {
      name: "  Credit card  ",
      type: "BANK",
      institution: "BCA",
      initial_balance: -250000,
      last4: "1234",
      color: "#1A2B3C",
      icon: "credit-card",
      include_in_total: false,
    });
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.data).toMatchObject({
      name: "Credit card",
      institution: "BCA",
      initial_balance: -250000,
      current_balance: -250000,
      last4: "1234",
      color: "#1A2B3C",
      icon: "credit-card",
      include_in_total: false,
    });
  });

  it("accepts an 8-digit color, the maximum amounts, and a 50 character name", async () => {
    const user = await newUser();

    expect(
      (await call("POST", "/accounts", user, { name: "a", type: "CASH", color: "#1A2B3C4D" })).status,
    ).toBe(201);
    expect(
      (await call("POST", "/accounts", user, { name: "b", type: "CASH", initial_balance: 999_999_999_999 })).status,
    ).toBe(201);
    expect(
      (await call("POST", "/accounts", user, { name: "c", type: "CASH", initial_balance: -999_999_999_999 })).status,
    ).toBe(201);
    expect(
      (await call("POST", "/accounts", user, { name: "x".repeat(50), type: "CASH" })).status,
    ).toBe(201);
  });

  it("a cash account may not have an institution; an empty one becomes null", async () => {
    const user = await newUser();

    const rejected = await call("POST", "/accounts", user, {
      name: "Wallet",
      type: "CASH",
      institution: "BCA",
    });
    const json = await rejected.json();
    expect(rejected.status).toBe(400);
    expect(Object.keys(json.errors)).toContain("institution");

    const accepted = await call("POST", "/accounts", user, {
      name: "Wallet",
      type: "CASH",
      institution: "   ",
    });
    expect(accepted.status).toBe(201);
    expect((await accepted.json()).data.institution).toBeNull();
  });

  it("400: invalid fields, with errors per field", async () => {
    const user = await newUser();
    const create = (body: unknown) => call("POST", "/accounts", user, body);

    const bad = await create({ name: "", type: "SAVINGS", initial_balance: 1.5, last4: "12" });
    const json = await bad.json();
    expect(bad.status).toBe(400);
    expect(json.code).toBe("VALIDATION_ERROR");
    expect(Object.keys(json.errors)).toEqual(
      expect.arrayContaining(["name", "type", "initial_balance", "last4"]),
    );

    expect((await create({ name: "x".repeat(51), type: "BANK" })).status).toBe(400);
    expect((await create({ name: "a", type: "BANK", initial_balance: "100" })).status).toBe(400);
    expect((await create({ name: "a", type: "BANK", initial_balance: 1_000_000_000_000 })).status).toBe(400);
    expect((await create({ name: "a", type: "BANK", last4: "12345" })).status).toBe(400);
    expect((await create({ name: "a", type: "BANK", last4: "12a4" })).status).toBe(400);
    expect((await create({ name: "a", type: "BANK", color: "red" })).status).toBe(400);
    expect((await create({ name: "a", type: "BANK", color: "#12345" })).status).toBe(400);
    expect((await create({ name: "a", type: "BANK", include_in_total: "yes" })).status).toBe(400);
    expect((await create({ type: "BANK" })).status).toBe(400);
    expect((await create({ name: "a" })).status).toBe(400);
  });

  it("400: fields the client may not set", async () => {
    const user = await newUser();
    const create = (extra: Record<string, unknown>) =>
      call("POST", "/accounts", user, { name: "a", type: "BANK", ...extra });

    expect((await create({ status: "ARCHIVED" })).status).toBe(400);
    expect((await create({ current_balance: 5000 })).status).toBe(400);
    expect((await create({ user_id: "USR001" })).status).toBe(400);
    expect((await create({ id: "ACC001" })).status).toBe(400);
  });

  it("400 without a body, 401 without a token", async () => {
    const user = await newUser();

    expect((await call("POST", "/accounts", user)).status).toBe(400);
    expect((await call("POST", "/accounts", undefined, { name: "a", type: "BANK" })).status).toBe(401);
  });
});

describe("GET /accounts", () => {
  it("lists active accounts in creation order, with the total balance", async () => {
    const user = await newUser();
    const first = await createAccount(user, { name: "First", initial_balance: 1000 });
    const second = await createAccount(user, { name: "Second", initial_balance: 2500 });

    const res = await call("GET", "/accounts", user);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.total_balance).toBe(3500);
    expect(json.data.accounts.map((a: any) => a.id)).toEqual([first.id, second.id]);
  });

  it("an empty list has a total of 0", async () => {
    const user = await newUser();

    const json = await (await call("GET", "/accounts", user)).json();

    expect(json.data).toEqual({ total_balance: 0, accounts: [] });
  });

  it("the total counts only active accounts with include_in_total", async () => {
    const user = await newUser();
    await createAccount(user, { initial_balance: 1000 });
    await createAccount(user, { initial_balance: 5000, include_in_total: false });
    const archived = await createAccount(user, { initial_balance: 7000 });
    await call("POST", `/accounts/${archived.id}/archive`, user);

    const json = await (await call("GET", "/accounts?status=ALL", user)).json();

    expect(json.data.accounts).toHaveLength(3);
    expect(json.data.total_balance).toBe(1000);
  });

  it("filters by status; the total does not depend on the filter", async () => {
    const user = await newUser();
    const active = await createAccount(user, { initial_balance: 1000 });
    const archived = await createAccount(user, { initial_balance: 2000 });
    await call("POST", `/accounts/${archived.id}/archive`, user);

    const onlyActive = await (await call("GET", "/accounts?status=ACTIVE", user)).json();
    const onlyArchived = await (await call("GET", "/accounts?status=ARCHIVED", user)).json();
    const all = await (await call("GET", "/accounts?status=ALL", user)).json();

    expect(onlyActive.data.accounts.map((a: any) => a.id)).toEqual([active.id]);
    expect(onlyArchived.data.accounts.map((a: any) => a.id)).toEqual([archived.id]);
    expect(all.data.accounts).toHaveLength(2);
    expect(onlyArchived.data.total_balance).toBe(1000);
  });

  it("400 for an unknown status value or an unknown query parameter", async () => {
    const user = await newUser();

    expect((await call("GET", "/accounts?status=DELETED", user)).status).toBe(400);
    expect((await call("GET", "/accounts?page=2", user)).status).toBe(400);
  });

  it("never shows another user's accounts", async () => {
    const owner = await newUser();
    const other = await newUser();
    await createAccount(owner, { initial_balance: 9999 });

    const json = await (await call("GET", "/accounts", other)).json();

    expect(json.data).toEqual({ total_balance: 0, accounts: [] });
  });

  it("401 without a token", async () => {
    expect((await call("GET", "/accounts", undefined)).status).toBe(401);
  });
});

describe("current_balance", () => {
  it("is initial + income - outcome, counting only live transactions", async () => {
    const user = await newUser();
    const account = await createAccount(user, { initial_balance: 100_000 });

    await insertTransaction({ userId: user.userId, accountId: account.id, type: "INCOME", amount: 50_000 });
    await insertTransaction({ userId: user.userId, accountId: account.id, type: "OUTCOME", amount: 20_000 });
    await insertTransaction({
      userId: user.userId,
      accountId: account.id,
      type: "OUTCOME",
      amount: 999_000,
      deleted: true,
    });

    const json = await (await call("GET", `/accounts/${account.id}`, user)).json();

    expect(json.data.initial_balance).toBe(100_000);
    expect(json.data.current_balance).toBe(130_000);
  });

  it("subtracts outgoing transfers and adds incoming transfers", async () => {
    const user = await newUser();
    const source = await createAccount(user, { initial_balance: 100_000 });
    const target = await createAccount(user, { initial_balance: 10_000 });

    await insertTransaction({
      userId: user.userId,
      accountId: source.id,
      toAccountId: target.id,
      type: "TRANSFER",
      amount: 40_000,
    });

    const list = await (await call("GET", "/accounts", user)).json();
    const byId = Object.fromEntries(list.data.accounts.map((a: any) => [a.id, a]));

    expect(byId[source.id].current_balance).toBe(60_000);
    expect(byId[target.id].current_balance).toBe(50_000);
    expect(list.data.total_balance).toBe(110_000);
  });

  it("can go negative", async () => {
    const user = await newUser();
    const account = await createAccount(user, { initial_balance: 1000 });
    await insertTransaction({ userId: user.userId, accountId: account.id, type: "OUTCOME", amount: 5000 });

    const json = await (await call("GET", `/accounts/${account.id}`, user)).json();

    expect(json.data.current_balance).toBe(-4000);
  });

  it("stays correct with many transactions", async () => {
    const user = await newUser();
    const account = await createAccount(user, { initial_balance: 0 });

    for (let i = 0; i < 20; i++) {
      await insertTransaction({ userId: user.userId, accountId: account.id, type: "INCOME", amount: 1000 });
    }

    const json = await (await call("GET", `/accounts/${account.id}`, user)).json();
    expect(json.data.current_balance).toBe(20_000);
  });
});

describe("GET /accounts/:id", () => {
  it("200 for an own account", async () => {
    const user = await newUser();
    const account = await createAccount(user, { name: "Mine", initial_balance: 1234 });

    const res = await call("GET", `/accounts/${account.id}`, user);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toEqual(account);
  });

  it("404 for another user's account, with the same body as an unknown id", async () => {
    const owner = await newUser();
    const intruder = await newUser();
    const account = await createAccount(owner);

    const foreign = await call("GET", `/accounts/${account.id}`, intruder);
    const unknown = await call("GET", "/accounts/ACC999999", intruder);

    expect(foreign.status).toBe(404);
    expect(unknown.status).toBe(404);
    expect(await foreign.json()).toEqual(await unknown.json());
  });

  it("401 without a token", async () => {
    expect((await call("GET", "/accounts/ACC001", undefined)).status).toBe(401);
  });
});

describe("PATCH /accounts/:id", () => {
  it("200: updates the given fields only", async () => {
    const user = await newUser();
    const account = await createAccount(user, {
      name: "Old",
      institution: "BCA",
      last4: "1111",
      color: "#112233",
      icon: "bank",
    });

    const res = await call("PATCH", `/accounts/${account.id}`, user, {
      name: "  New  ",
      include_in_total: false,
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toEqual({
      ...account,
      name: "New",
      include_in_total: false,
    });
  });

  it("null clears the optional fields", async () => {
    const user = await newUser();
    const account = await createAccount(user, {
      institution: "BCA",
      last4: "1111",
      color: "#112233",
      icon: "bank",
    });

    const res = await call("PATCH", `/accounts/${account.id}`, user, {
      institution: null,
      last4: null,
      color: null,
      icon: null,
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toMatchObject({
      institution: null,
      last4: null,
      color: null,
      icon: null,
    });
  });

  it("changing include_in_total changes the total", async () => {
    const user = await newUser();
    const account = await createAccount(user, { initial_balance: 4000 });

    await call("PATCH", `/accounts/${account.id}`, user, { include_in_total: false });

    const json = await (await call("GET", "/accounts", user)).json();
    expect(json.data.total_balance).toBe(0);
  });

  it("changes the initial balance directly while there are no transactions", async () => {
    const user = await newUser();
    const account = await createAccount(user, { initial_balance: 1000 });

    const res = await call("PATCH", `/accounts/${account.id}`, user, { initial_balance: 5000 });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.initial_balance).toBe(5000);
    expect(json.data.current_balance).toBe(5000);
  });

  it("422 CONFIRMATION_REQUIRED when the account has transactions, with a preview and no change", async () => {
    const user = await newUser();
    const account = await createAccount(user, { initial_balance: 1000 });
    await insertTransaction({ userId: user.userId, accountId: account.id, type: "INCOME", amount: 500 });

    const res = await call("PATCH", `/accounts/${account.id}`, user, { initial_balance: 4000 });
    const json = await res.json();

    expect(res.status).toBe(422);
    expect(json.success).toBe(false);
    expect(json.code).toBe("CONFIRMATION_REQUIRED");
    expect(json.data).toEqual({ preview: { old_balance: 1500, new_balance: 4500 } });

    const after = await (await call("GET", `/accounts/${account.id}`, user)).json();
    expect(after.data.initial_balance).toBe(1000);
  });

  it("applies the change when repeated with confirm: true", async () => {
    const user = await newUser();
    const account = await createAccount(user, { initial_balance: 1000 });
    await insertTransaction({ userId: user.userId, accountId: account.id, type: "INCOME", amount: 500 });

    const res = await call("PATCH", `/accounts/${account.id}`, user, {
      initial_balance: 4000,
      confirm: true,
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.initial_balance).toBe(4000);
    expect(json.data.current_balance).toBe(4500);
  });

  it("transactions in the trash also require confirmation", async () => {
    const user = await newUser();
    const account = await createAccount(user, { initial_balance: 1000 });
    await insertTransaction({
      userId: user.userId,
      accountId: account.id,
      type: "OUTCOME",
      amount: 100,
      deleted: true,
    });

    const res = await call("PATCH", `/accounts/${account.id}`, user, { initial_balance: 2000 });

    expect(res.status).toBe(422);
  });

  it("an unchanged initial balance needs no confirmation", async () => {
    const user = await newUser();
    const account = await createAccount(user, { initial_balance: 1000 });
    await insertTransaction({ userId: user.userId, accountId: account.id, type: "INCOME", amount: 500 });

    const res = await call("PATCH", `/accounts/${account.id}`, user, {
      initial_balance: 1000,
      name: "Renamed",
    });

    expect(res.status).toBe(200);
  });

  it("confirmation is only about the initial balance, other fields are never blocked", async () => {
    const user = await newUser();
    const account = await createAccount(user, { initial_balance: 1000 });
    await insertTransaction({ userId: user.userId, accountId: account.id, type: "INCOME", amount: 500 });

    const res = await call("PATCH", `/accounts/${account.id}`, user, { name: "Renamed" });

    expect(res.status).toBe(200);
  });

  it("a bank account with an institution cannot become cash unless the institution is cleared", async () => {
    const user = await newUser();
    const account = await createAccount(user, { institution: "BCA" });

    const rejected = await call("PATCH", `/accounts/${account.id}`, user, { type: "CASH" });
    expect(rejected.status).toBe(400);
    expect(Object.keys((await rejected.json()).errors)).toContain("institution");

    const accepted = await call("PATCH", `/accounts/${account.id}`, user, {
      type: "CASH",
      institution: null,
    });
    expect(accepted.status).toBe(200);
    expect((await accepted.json()).data).toMatchObject({ type: "CASH", institution: null });
  });

  it("an institution cannot be set on a cash account", async () => {
    const user = await newUser();
    const account = await createAccount(user, { type: "CASH" });

    const res = await call("PATCH", `/accounts/${account.id}`, user, { institution: "BCA" });

    expect(res.status).toBe(400);
  });

  it("400: empty body, only confirm, invalid values, fields that cannot be changed", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const patch = (body: unknown) => call("PATCH", `/accounts/${account.id}`, user, body);

    expect((await patch({})).status).toBe(400);
    expect((await patch({ confirm: true })).status).toBe(400);
    expect((await patch({ name: "" })).status).toBe(400);
    expect((await patch({ last4: "12" })).status).toBe(400);
    expect((await patch({ status: "ARCHIVED" })).status).toBe(400);
    expect((await patch({ current_balance: 1 })).status).toBe(400);
    expect((await patch({ user_id: "USR001" })).status).toBe(400);
  });

  it("404 for another user's account, and it is left untouched", async () => {
    const owner = await newUser();
    const intruder = await newUser();
    const account = await createAccount(owner, { name: "Private" });

    const res = await call("PATCH", `/accounts/${account.id}`, intruder, { name: "Hacked" });

    expect(res.status).toBe(404);
    const after = await (await call("GET", `/accounts/${account.id}`, owner)).json();
    expect(after.data.name).toBe("Private");
  });

  it("an archived account can still be edited", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    await call("POST", `/accounts/${account.id}/archive`, user);

    const res = await call("PATCH", `/accounts/${account.id}`, user, { name: "Edited" });

    expect(res.status).toBe(200);
    expect((await res.json()).data.status).toBe("ARCHIVED");
  });
});

describe("DELETE /accounts/:id", () => {
  it("204: deletes an account without transactions", async () => {
    const user = await newUser();
    const account = await createAccount(user);

    const res = await call("DELETE", `/accounts/${account.id}`, user);

    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");
    expect((await call("GET", `/accounts/${account.id}`, user)).status).toBe(404);
  });

  it("422 BUSINESS_RULE when the account has transactions, and it stays", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    await insertTransaction({ userId: user.userId, accountId: account.id, type: "INCOME", amount: 1000 });

    const res = await call("DELETE", `/accounts/${account.id}`, user);
    const json = await res.json();

    expect(res.status).toBe(422);
    expect(json.code).toBe("BUSINESS_RULE");
    expect((await call("GET", `/accounts/${account.id}`, user)).status).toBe(200);
  });

  it("422 even when the only transactions are in the trash", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    await insertTransaction({
      userId: user.userId,
      accountId: account.id,
      type: "OUTCOME",
      amount: 1000,
      deleted: true,
    });

    expect((await call("DELETE", `/accounts/${account.id}`, user)).status).toBe(422);
  });

  it("422 when the account is only the destination of a transfer", async () => {
    const user = await newUser();
    const source = await createAccount(user);
    const target = await createAccount(user);
    await insertTransaction({
      userId: user.userId,
      accountId: source.id,
      toAccountId: target.id,
      type: "TRANSFER",
      amount: 1000,
    });

    expect((await call("DELETE", `/accounts/${target.id}`, user)).status).toBe(422);
  });

  it("422 when a recurring plan uses the account", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    await insertRecurringPlan({ userId: user.userId, accountId: account.id });

    const res = await call("DELETE", `/accounts/${account.id}`, user);

    expect(res.status).toBe(422);
    expect((await res.json()).code).toBe("BUSINESS_RULE");
  });

  it("clears the account from templates that used it", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const other = await createAccount(user);
    const templateId = await insertTemplate({ userId: user.userId, accountId: account.id });
    const untouchedId = await insertTemplate({ userId: user.userId, accountId: other.id });

    expect((await call("DELETE", `/accounts/${account.id}`, user)).status).toBe(204);

    expect((await templateRow(templateId)).accountId).toBeNull();
    expect((await templateRow(untouchedId)).accountId).toBe(other.id);
  });

  it("404 for another user's account, and it stays", async () => {
    const owner = await newUser();
    const intruder = await newUser();
    const account = await createAccount(owner);

    expect((await call("DELETE", `/accounts/${account.id}`, intruder)).status).toBe(404);
    expect((await call("GET", `/accounts/${account.id}`, owner)).status).toBe(200);
  });

  it("404 when deleted twice", async () => {
    const user = await newUser();
    const account = await createAccount(user);

    await call("DELETE", `/accounts/${account.id}`, user);

    expect((await call("DELETE", `/accounts/${account.id}`, user)).status).toBe(404);
  });
});

describe("POST /accounts/:id/archive and /unarchive", () => {
  it("200: archives, removing the account from the default list and the total", async () => {
    const user = await newUser();
    const keep = await createAccount(user, { initial_balance: 1000 });
    const account = await createAccount(user, { initial_balance: 4000 });

    const res = await call("POST", `/accounts/${account.id}/archive`, user);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.status).toBe("ARCHIVED");
    expect(json.data.current_balance).toBe(4000);

    const list = await (await call("GET", "/accounts", user)).json();
    expect(list.data.accounts.map((a: any) => a.id)).toEqual([keep.id]);
    expect(list.data.total_balance).toBe(1000);
  });

  it("clears the account from templates, both as source and as destination", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const other = await createAccount(user);
    const asSource = await insertTemplate({ userId: user.userId, accountId: account.id });
    const asDestination = await insertTemplate({
      userId: user.userId,
      accountId: other.id,
      toAccountId: account.id,
    });
    const unrelated = await insertTemplate({ userId: user.userId, accountId: other.id });

    await call("POST", `/accounts/${account.id}/archive`, user);

    expect((await templateRow(asSource)).accountId).toBeNull();
    const destination = await templateRow(asDestination);
    expect(destination.toAccountId).toBeNull();
    expect(destination.accountId).toBe(other.id);
    expect((await templateRow(unrelated)).accountId).toBe(other.id);
  });

  it("works for an account that has transactions, and keeps its balance", async () => {
    const user = await newUser();
    const account = await createAccount(user, { initial_balance: 1000 });
    await insertTransaction({ userId: user.userId, accountId: account.id, type: "INCOME", amount: 500 });

    const res = await call("POST", `/accounts/${account.id}/archive`, user);

    expect(res.status).toBe(200);
    expect((await res.json()).data.current_balance).toBe(1500);
  });

  it("archiving twice is harmless", async () => {
    const user = await newUser();
    const account = await createAccount(user);

    await call("POST", `/accounts/${account.id}/archive`, user);
    const again = await call("POST", `/accounts/${account.id}/archive`, user);

    expect(again.status).toBe(200);
    expect((await again.json()).data.status).toBe("ARCHIVED");
  });

  it("unarchive restores the account to the list and the total", async () => {
    const user = await newUser();
    const account = await createAccount(user, { initial_balance: 4000 });
    await call("POST", `/accounts/${account.id}/archive`, user);

    const res = await call("POST", `/accounts/${account.id}/unarchive`, user);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.status).toBe("ACTIVE");

    const list = await (await call("GET", "/accounts", user)).json();
    expect(list.data.total_balance).toBe(4000);
  });

  it("unarchiving an active account is harmless", async () => {
    const user = await newUser();
    const account = await createAccount(user);

    const res = await call("POST", `/accounts/${account.id}/unarchive`, user);

    expect(res.status).toBe(200);
    expect((await res.json()).data.status).toBe("ACTIVE");
  });

  it("an archived account can be deleted when it has no transactions", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    await call("POST", `/accounts/${account.id}/archive`, user);

    expect((await call("DELETE", `/accounts/${account.id}`, user)).status).toBe(204);
  });

  it("404 for another user's account, which stays unchanged", async () => {
    const owner = await newUser();
    const intruder = await newUser();
    const account = await createAccount(owner);

    expect((await call("POST", `/accounts/${account.id}/archive`, intruder)).status).toBe(404);
    expect((await call("POST", `/accounts/${account.id}/unarchive`, intruder)).status).toBe(404);

    const after = await (await call("GET", `/accounts/${account.id}`, owner)).json();
    expect(after.data.status).toBe("ACTIVE");
  });

  it("401 without a token", async () => {
    expect((await call("POST", "/accounts/ACC001/archive", undefined)).status).toBe(401);
    expect((await call("POST", "/accounts/ACC001/unarchive", undefined)).status).toBe(401);
  });
});
