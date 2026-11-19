import { afterAll, describe, expect, it } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { transactions } from "../../db/schema/transactions.js";
import { createUser, deleteUsers, startServer, transactionRows } from "../helpers.js";

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

const makeTemplate = async (user: User, body: Record<string, unknown> = {}) => {
  const res = await call("POST", "/templates", user, {
    name: `Template ${crypto.randomUUID().slice(0, 8)}`,
    type: "OUTCOME",
    transaction_name: "Lunch",
    ...body,
  });
  return (await res.json()).data as Record<string, any>;
};

const useTemplate = (user: User, accountId: string, templateId: string) =>
  call("POST", "/transactions", user, {
    type: "OUTCOME",
    name: "Lunch",
    amount: 1000,
    account_id: accountId,
    template_id: templateId,
  });

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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

afterAll(async () => {
  try {
    await deleteUsers(emails);
  } finally {
    server.close();
  }
});

describe("POST /templates: from scratch", () => {
  it("201: a complete template", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const category = await categoryId(user, "Makanan", "OUTCOME");

    const res = await call("POST", "/templates", user, {
      name: "  Office lunch  ",
      type: "OUTCOME",
      transaction_name: "  Lunch  ",
      amount: 35_000,
      account_id: account.id,
      category_id: category,
      location: "Canteen",
      note: "weekday",
      tags: ["Work", " work ", "FOOD"],
    });
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.success).toBe(true);
    expect(json.data).toEqual({
      id: expect.stringMatching(/^TPL\d{3,}$/),
      name: "Office lunch",
      type: "OUTCOME",
      transaction_name: "Lunch",
      amount: 35_000,
      account_id: account.id,
      to_account_id: null,
      category_id: category,
      location: "Canteen",
      note: "weekday",
      tags: ["work", "food"],
      use_count: 0,
      last_used_at: null,
      missing: [],
    });
  });

  it("lists what is still missing", async () => {
    const user = await newUser();
    const account = await createAccount(user);

    const bare = await makeTemplate(user);
    expect(bare.amount).toBeNull();
    expect(bare.missing).toEqual(["amount", "account_id"]);

    const withAccount = await makeTemplate(user, { account_id: account.id });
    expect(withAccount.missing).toEqual(["amount"]);

    const withAmount = await makeTemplate(user, { amount: 5000, account_id: account.id });
    expect(withAmount.missing).toEqual([]);

    const transfer = await makeTemplate(user, { type: "TRANSFER" });
    expect(transfer.missing).toEqual(["amount", "account_id", "to_account_id"]);
  });

  it("a transfer template with both accounts", async () => {
    const user = await newUser();
    const source = await createAccount(user);
    const target = await createAccount(user);

    const template = await makeTemplate(user, {
      type: "TRANSFER",
      amount: 20_000,
      account_id: source.id,
      to_account_id: target.id,
    });

    expect(template).toMatchObject({
      type: "TRANSFER",
      account_id: source.id,
      to_account_id: target.id,
      category_id: null,
      missing: [],
    });
  });

  it("409 for a name already used, ignoring case; another user may reuse it", async () => {
    const user = await newUser();
    const other = await newUser();
    await makeTemplate(user, { name: "Office lunch" });

    const duplicate = await call("POST", "/templates", user, {
      name: "OFFICE LUNCH",
      type: "OUTCOME",
      transaction_name: "x",
    });
    expect(duplicate.status).toBe(409);
    expect((await duplicate.json()).code).toBe("CONFLICT");

    const sameForOther = await call("POST", "/templates", other, {
      name: "Office lunch",
      type: "OUTCOME",
      transaction_name: "x",
    });
    expect(sameForOther.status).toBe(201);
  });

  it("400: invalid fields, with errors per field", async () => {
    const user = await newUser();
    const create = (body: unknown) => call("POST", "/templates", user, body);

    const bad = await create({ name: "", type: "REFUND", transaction_name: "" });
    const json = await bad.json();
    expect(bad.status).toBe(400);
    expect(json.code).toBe("VALIDATION_ERROR");
    expect(Object.keys(json.errors)).toEqual(
      expect.arrayContaining(["name", "type", "transaction_name"]),
    );

    expect((await create({ name: "n".repeat(51), type: "OUTCOME", transaction_name: "x" })).status).toBe(400);
    expect((await create({ name: "a", type: "OUTCOME", transaction_name: "x".repeat(101) })).status).toBe(400);
    expect((await create({ name: "a", type: "OUTCOME", transaction_name: "x", amount: 0 })).status).toBe(400);
    expect((await create({ name: "a", type: "OUTCOME", transaction_name: "x", amount: 1.5 })).status).toBe(400);
    expect((await create({ name: "a", type: "OUTCOME", transaction_name: "x", amount: 1_000_000_000_000 })).status).toBe(400);
    expect((await create({ name: "a", type: "OUTCOME", transaction_name: "x", note: "n".repeat(1001) })).status).toBe(400);
    expect((await create({ name: "a", type: "OUTCOME", transaction_name: "x", location: "l".repeat(256) })).status).toBe(400);
    expect((await create({ name: "a", type: "OUTCOME", transaction_name: "x", tags: Array.from({ length: 11 }, (_, i) => `t${i}`) })).status).toBe(400);
  });

  it("400: type and transaction_name are required without a source transaction", async () => {
    const user = await newUser();

    const res = await call("POST", "/templates", user, { name: "Only a name" });
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(Object.keys(json.errors)).toEqual(
      expect.arrayContaining(["type", "transaction_name"]),
    );
    expect((await call("POST", "/templates", user)).status).toBe(400);
  });

  it("400: fields the client may not set", async () => {
    const user = await newUser();
    const create = (extra: Record<string, unknown>) =>
      call("POST", "/templates", user, {
        name: "Valid",
        type: "OUTCOME",
        transaction_name: "x",
        ...extra,
      });

    for (const extra of [
      { use_count: 5 },
      { last_used_at: "2026-01-01T00:00:00Z" },
      { missing: [] },
      { id: "TPL001" },
      { user_id: "USR001" },
      { items: [] },
      { images: [] },
    ]) {
      expect((await create(extra)).status).toBe(400);
    }
  });

  it("400: a transfer cannot have a category, others cannot have a destination, accounts must differ", async () => {
    const user = await newUser();
    const a = await createAccount(user);
    const b = await createAccount(user);
    const category = await categoryId(user, "Makanan", "OUTCOME");

    const transferWithCategory = await call("POST", "/templates", user, {
      name: "t1",
      type: "TRANSFER",
      transaction_name: "x",
      category_id: category,
    });
    expect(transferWithCategory.status).toBe(400);
    expect(Object.keys((await transferWithCategory.json()).errors)).toContain("category_id");

    const outcomeWithDestination = await call("POST", "/templates", user, {
      name: "t2",
      type: "OUTCOME",
      transaction_name: "x",
      to_account_id: b.id,
    });
    expect(outcomeWithDestination.status).toBe(400);

    const sameAccount = await call("POST", "/templates", user, {
      name: "t3",
      type: "TRANSFER",
      transaction_name: "x",
      account_id: a.id,
      to_account_id: a.id,
    });
    expect(sameAccount.status).toBe(400);
  });

  it("422 for a category of the wrong type or an archived account, 404 for foreign ones", async () => {
    const user = await newUser();
    const other = await newUser();
    const archived = await createAccount(user);
    await call("POST", `/accounts/${archived.id}/archive`, user);
    const foreignAccount = await createAccount(other);
    const income = await categoryId(user, "Gaji", "INCOME");
    const foreignCategory = await categoryId(other, "Makanan", "OUTCOME");
    const create = (extra: Record<string, unknown>) =>
      call("POST", "/templates", user, {
        name: `t-${crypto.randomUUID().slice(0, 6)}`,
        type: "OUTCOME",
        transaction_name: "x",
        ...extra,
      });

    expect((await create({ category_id: income })).status).toBe(422);
    expect((await create({ account_id: archived.id })).status).toBe(422);
    expect((await create({ account_id: foreignAccount.id })).status).toBe(404);
    expect((await create({ account_id: "ACC999999" })).status).toBe(404);
    expect((await create({ category_id: foreignCategory })).status).toBe(404);
  });

  it("401 without a token", async () => {
    expect((await call("POST", "/templates", undefined, {})).status).toBe(401);
  });
});

describe("POST /templates: from an existing transaction", () => {
  it("copies the transaction fields, naming the template", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const category = await categoryId(user, "Makanan", "OUTCOME");
    const source = await record(user, account.id, {
      name: "Monthly groceries",
      amount: 450_000,
      category_id: category,
      location: "Indomaret",
      note: "Soap, rice",
      tags: ["monthly"],
      items: [{ name: "Rice", total_price: 100_000 }],
    });

    const res = await call("POST", "/templates", user, {
      name: "Monthly groceries",
      source_transaction_id: source.id,
    });
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.data).toEqual({
      id: expect.stringMatching(/^TPL\d{3,}$/),
      name: "Monthly groceries",
      type: "OUTCOME",
      transaction_name: "Monthly groceries",
      amount: 450_000,
      account_id: account.id,
      to_account_id: null,
      category_id: category,
      location: "Indomaret",
      note: "Soap, rice",
      tags: ["monthly"],
      use_count: 0,
      last_used_at: null,
      missing: [],
    });
  });

  it("copies a transfer's accounts but not its admin fee", async () => {
    const user = await newUser();
    const source = await createAccount(user);
    const target = await createAccount(user);
    const transfer = await record(user, source.id, {
      type: "TRANSFER",
      name: "Top up",
      amount: 20_000,
      to_account_id: target.id,
      admin_fee: 1000,
    });

    const json = await (
      await call("POST", "/templates", user, { name: "Top up", source_transaction_id: transfer.id })
    ).json();

    expect(json.data).toMatchObject({
      type: "TRANSFER",
      amount: 20_000,
      account_id: source.id,
      to_account_id: target.id,
      missing: [],
    });
    expect(json.data.admin_fee).toBeUndefined();
  });

  it("fields sent in the same request override the copied ones, including null", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const category = await categoryId(user, "Makanan", "OUTCOME");
    const source = await record(user, account.id, {
      name: "Original",
      amount: 10_000,
      category_id: category,
      note: "copied note",
    });

    const json = await (
      await call("POST", "/templates", user, {
        name: "Changed",
        source_transaction_id: source.id,
        transaction_name: "Renamed",
        amount: null,
        category_id: null,
      })
    ).json();

    expect(json.data).toMatchObject({
      transaction_name: "Renamed",
      amount: null,
      category_id: null,
      note: "copied note",
      account_id: account.id,
      missing: ["amount"],
    });
  });

  it("drops a copied account that has since been archived", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const source = await record(user, account.id);
    await call("POST", `/accounts/${account.id}/archive`, user);

    const res = await call("POST", "/templates", user, {
      name: "From archived",
      source_transaction_id: source.id,
    });
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.data.account_id).toBeNull();
    expect(json.data.missing).toEqual(["account_id"]);
  });

  it("an archived account sent explicitly is still rejected", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const archived = await createAccount(user);
    await call("POST", `/accounts/${archived.id}/archive`, user);
    const source = await record(user, account.id);

    const res = await call("POST", "/templates", user, {
      name: "To archived",
      source_transaction_id: source.id,
      account_id: archived.id,
    });

    expect(res.status).toBe(422);
  });

  it("404 for a trashed, foreign, or unknown source", async () => {
    const owner = await newUser();
    const intruder = await newUser();
    const account = await createAccount(owner);
    const source = await record(owner, account.id);
    const trashed = await record(owner, account.id);
    await db.update(transactions).set({ deletedAt: new Date() }).where(eq(transactions.id, trashed.id));

    const send = (user: User, sourceId: string) =>
      call("POST", "/templates", user, {
        name: `t-${crypto.randomUUID().slice(0, 6)}`,
        source_transaction_id: sourceId,
      });

    expect((await send(owner, trashed.id)).status).toBe(404);
    const foreign = await send(intruder, source.id);
    const unknown = await send(intruder, "TRANS999999");
    expect(foreign.status).toBe(404);
    expect(await foreign.json()).toEqual(await unknown.json());
  });

  it("409 when the template name is taken", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const source = await record(user, account.id);
    await makeTemplate(user, { name: "Taken" });

    const res = await call("POST", "/templates", user, {
      name: "taken",
      source_transaction_id: source.id,
    });

    expect(res.status).toBe(409);
  });
});

describe("GET /templates", () => {
  it("an empty list", async () => {
    const user = await newUser();

    const res = await call("GET", "/templates", user);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toEqual([]);
  });

  it("most used first, then most recently used, then unused newest first", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const unusedOld = await makeTemplate(user, { name: "unused old" });
    await sleep(20);
    const unusedNew = await makeTemplate(user, { name: "unused new" });
    const twice = await makeTemplate(user, { name: "twice" });
    const onceEarly = await makeTemplate(user, { name: "once early" });
    const onceLate = await makeTemplate(user, { name: "once late" });

    await useTemplate(user, account.id, twice.id);
    await useTemplate(user, account.id, onceEarly.id);
    await sleep(20);
    await useTemplate(user, account.id, onceLate.id);
    await useTemplate(user, account.id, twice.id);

    const json = await (await call("GET", "/templates", user)).json();

    expect(json.data.map((t: any) => t.id)).toEqual([
      twice.id,
      onceLate.id,
      onceEarly.id,
      unusedNew.id,
      unusedOld.id,
    ]);
    expect(json.data[0]).toMatchObject({ use_count: 2 });
    expect(json.data[0].last_used_at).not.toBeNull();
  });

  it("never shows another user's templates", async () => {
    const owner = await newUser();
    const other = await newUser();
    await makeTemplate(owner);

    const json = await (await call("GET", "/templates", other)).json();

    expect(json.data).toEqual([]);
  });

  it("401 without a token", async () => {
    expect((await call("GET", "/templates", undefined)).status).toBe(401);
  });
});

describe("GET /templates/:id", () => {
  it("200 for an own template", async () => {
    const user = await newUser();
    const created = await makeTemplate(user, { amount: 5000 });

    const res = await call("GET", `/templates/${created.id}`, user);

    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual(created);
  });

  it("404 for another user's or an unknown template, with identical bodies", async () => {
    const owner = await newUser();
    const intruder = await newUser();
    const created = await makeTemplate(owner);

    const foreign = await call("GET", `/templates/${created.id}`, intruder);
    const unknown = await call("GET", "/templates/TPL999999", intruder);

    expect(foreign.status).toBe(404);
    expect(await foreign.json()).toEqual(await unknown.json());
  });
});

describe("PATCH /templates/:id", () => {
  it("200: updates the given fields only", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const created = await makeTemplate(user, {
      amount: 5000,
      account_id: account.id,
      note: "keep",
    });

    const res = await call("PATCH", `/templates/${created.id}`, user, {
      name: "  Renamed  ",
      transaction_name: "New name",
      amount: 7000,
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toEqual({
      ...created,
      name: "Renamed",
      transaction_name: "New name",
      amount: 7000,
    });
  });

  it("amount: null makes the amount ask-every-time, and the other fields can be cleared", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const category = await categoryId(user, "Makanan", "OUTCOME");
    const created = await makeTemplate(user, {
      amount: 5000,
      account_id: account.id,
      category_id: category,
      location: "x",
      note: "y",
    });

    const json = await (
      await call("PATCH", `/templates/${created.id}`, user, {
        amount: null,
        account_id: null,
        category_id: null,
        location: null,
        note: null,
        tags: [],
      })
    ).json();

    expect(json.data).toMatchObject({
      amount: null,
      account_id: null,
      category_id: null,
      location: null,
      note: null,
      tags: [],
      missing: ["amount", "account_id"],
    });
  });

  it("409 when renaming to another template's name; a case change of its own name is fine", async () => {
    const user = await newUser();
    await makeTemplate(user, { name: "First" });
    const second = await makeTemplate(user, { name: "Second" });

    const clash = await call("PATCH", `/templates/${second.id}`, user, { name: "first" });
    expect(clash.status).toBe(409);

    const caseOnly = await call("PATCH", `/templates/${second.id}`, user, { name: "SECOND" });
    expect(caseOnly.status).toBe(200);
    expect((await caseOnly.json()).data.name).toBe("SECOND");
  });

  it("changing the type needs matching fields", async () => {
    const user = await newUser();
    const source = await createAccount(user);
    const target = await createAccount(user);
    const food = await categoryId(user, "Makanan", "OUTCOME");
    const created = await makeTemplate(user, { account_id: source.id, category_id: food });

    const mismatch = await call("PATCH", `/templates/${created.id}`, user, { type: "INCOME" });
    expect(mismatch.status).toBe(422);

    const transferWithCategory = await call("PATCH", `/templates/${created.id}`, user, {
      type: "TRANSFER",
      to_account_id: target.id,
    });
    expect(transferWithCategory.status).toBe(400);

    const toTransfer = await call("PATCH", `/templates/${created.id}`, user, {
      type: "TRANSFER",
      to_account_id: target.id,
      category_id: null,
    });
    expect(toTransfer.status).toBe(200);
    expect((await toTransfer.json()).data).toMatchObject({
      type: "TRANSFER",
      to_account_id: target.id,
      category_id: null,
    });

    const stillDestination = await call("PATCH", `/templates/${created.id}`, user, { type: "OUTCOME" });
    expect(stillDestination.status).toBe(400);

    const back = await call("PATCH", `/templates/${created.id}`, user, {
      type: "OUTCOME",
      to_account_id: null,
    });
    expect(back.status).toBe(200);
  });

  it("422 for an archived account, 404 for a foreign one, 400 for source = destination", async () => {
    const user = await newUser();
    const other = await newUser();
    const account = await createAccount(user);
    const archived = await createAccount(user);
    await call("POST", `/accounts/${archived.id}/archive`, user);
    const foreign = await createAccount(other);
    const created = await makeTemplate(user, { type: "TRANSFER", account_id: account.id });
    const patch = (body: unknown) => call("PATCH", `/templates/${created.id}`, user, body);

    expect((await patch({ account_id: archived.id })).status).toBe(422);
    expect((await patch({ account_id: foreign.id })).status).toBe(404);
    expect((await patch({ to_account_id: account.id })).status).toBe(400);
  });

  it("400: empty body, invalid values, and fields that cannot be changed", async () => {
    const user = await newUser();
    const created = await makeTemplate(user);
    const patch = (body: unknown) => call("PATCH", `/templates/${created.id}`, user, body);

    expect((await patch({})).status).toBe(400);
    expect((await patch({ name: "" })).status).toBe(400);
    expect((await patch({ amount: 0 })).status).toBe(400);
    expect((await patch({ use_count: 9 })).status).toBe(400);
    expect((await patch({ last_used_at: null })).status).toBe(400);
    expect((await patch({ missing: [] })).status).toBe(400);
  });

  it("404 for another user's template, which stays untouched", async () => {
    const owner = await newUser();
    const intruder = await newUser();
    const created = await makeTemplate(owner, { name: "Private" });

    const res = await call("PATCH", `/templates/${created.id}`, intruder, { name: "Hacked" });

    expect(res.status).toBe(404);
    const after = await (await call("GET", `/templates/${created.id}`, owner)).json();
    expect(after.data.name).toBe("Private");
  });

  it("401 without a token", async () => {
    expect((await call("PATCH", "/templates/TPL001", undefined, { name: "x" })).status).toBe(401);
  });
});

describe("DELETE /templates/:id", () => {
  it("204, and transactions created from it are unaffected", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const created = await makeTemplate(user, { amount: 1000, account_id: account.id });
    await useTemplate(user, account.id, created.id);

    const res = await call("DELETE", `/templates/${created.id}`, user);

    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");
    expect((await call("GET", `/templates/${created.id}`, user)).status).toBe(404);
    expect(await transactionRows(user.userId)).toHaveLength(1);
  });

  it("404 when deleted twice, or for another user's template, which stays", async () => {
    const owner = await newUser();
    const intruder = await newUser();
    const created = await makeTemplate(owner);

    expect((await call("DELETE", `/templates/${created.id}`, intruder)).status).toBe(404);
    expect((await call("GET", `/templates/${created.id}`, owner)).status).toBe(200);

    await call("DELETE", `/templates/${created.id}`, owner);
    expect((await call("DELETE", `/templates/${created.id}`, owner)).status).toBe(404);
  });

  it("401 without a token", async () => {
    expect((await call("DELETE", "/templates/TPL001", undefined)).status).toBe(401);
  });
});

describe("templates and accounts", () => {
  it("archiving an account clears it from the template, so the template reports it as missing", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const created = await makeTemplate(user, { amount: 5000, account_id: account.id });
    expect(created.missing).toEqual([]);

    await call("POST", `/accounts/${account.id}/archive`, user);

    const after = await (await call("GET", `/templates/${created.id}`, user)).json();
    expect(after.data.account_id).toBeNull();
    expect(after.data.missing).toEqual(["account_id"]);
  });

  it("deleting a category moves the template to the fallback category", async () => {
    const user = await newUser();
    const food = await categoryId(user, "Makanan", "OUTCOME");
    const fallback = await categoryId(user, "Lainnya", "OUTCOME");
    const created = await makeTemplate(user, { category_id: food });

    await call("DELETE", `/categories/${food}`, user);

    const after = await (await call("GET", `/templates/${created.id}`, user)).json();
    expect(after.data.category_id).toBe(fallback);
  });
});
