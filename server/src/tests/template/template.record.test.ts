import { afterAll, describe, expect, it } from "bun:test";
import { createUser, deleteUsers, startServer, transactionRows } from "../helpers.js";

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

const recordFrom = (
  user: User,
  templateId: string,
  body?: unknown,
  headers?: Record<string, string>,
) => call("POST", `/templates/${templateId}/record`, user, body, headers);

const getTemplate = async (user: User, id: string) =>
  (await (await call("GET", `/templates/${id}`, user)).json()).data as Record<string, any>;

afterAll(async () => {
  try {
    await deleteUsers(emails);
  } finally {
    server.close();
  }
});

describe("POST /templates/:id/record: from a complete template", () => {
  it("201: records a transaction, returns the balance, and counts the use", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const category = await categoryId(user, "Makanan", "OUTCOME");
    const template = await makeTemplate(user, {
      transaction_name: "Office lunch",
      amount: 35_000,
      account_id: account.id,
      category_id: category,
      location: "Canteen",
      note: "weekday",
      tags: ["work"],
    });

    const res = await recordFrom(user, template.id, {});
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.success).toBe(true);
    expect(json.data.account_balance_after).toBe(65_000);
    expect(json.data.warnings).toEqual([]);
    expect(json.data.transaction).toMatchObject({
      id: expect.stringMatching(/^TRANS\d{3,}$/),
      type: "OUTCOME",
      name: "Office lunch",
      amount: 35_000,
      account_id: account.id,
      category_id: category,
      location: "Canteen",
      note: "weekday",
      tags: ["work"],
      source: "MANUAL",
      items: [],
    });

    const after = await getTemplate(user, template.id);
    expect(after.use_count).toBe(1);
    expect(after.last_used_at).not.toBeNull();
  });

  it("works without a request body", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const template = await makeTemplate(user, { amount: 1000, account_id: account.id });

    const res = await recordFrom(user, template.id);

    expect(res.status).toBe(201);
  });

  it("the transaction does not point back to the template", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const template = await makeTemplate(user, { amount: 1000, account_id: account.id });

    const json = await (await recordFrom(user, template.id)).json();

    expect(json.data.transaction.template_id).toBeUndefined();
    const detail = await (
      await call("GET", `/transactions/${json.data.transaction.id}`, user)
    ).json();
    expect(detail.data.template_id).toBeUndefined();
  });

  it("recording again counts again and moves the template to the top of the list", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const first = await makeTemplate(user, { amount: 1000, account_id: account.id });
    const second = await makeTemplate(user, { amount: 1000, account_id: account.id });

    await recordFrom(user, second.id);
    await recordFrom(user, second.id);
    await recordFrom(user, first.id);

    const list = await (await call("GET", "/templates", user)).json();
    expect(list.data.map((t: any) => [t.id, t.use_count])).toEqual([
      [second.id, 2],
      [first.id, 1],
    ]);
  });

  it("records a transfer template with balances for both accounts and no admin fee", async () => {
    const user = await newUser();
    const source = await createAccount(user);
    const target = await createAccount(user, { initial_balance: 0 });
    const template = await makeTemplate(user, {
      type: "TRANSFER",
      transaction_name: "Top up",
      amount: 20_000,
      account_id: source.id,
      to_account_id: target.id,
    });

    const res = await recordFrom(user, template.id, {});
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.data.balances_after).toEqual({
      [source.id]: 80_000,
      [target.id]: 20_000,
    });
    expect(json.data.transaction).toMatchObject({ type: "TRANSFER", admin_fee: 0 });
    expect(await transactionRows(user.userId)).toHaveLength(1);
  });

  it("warns NEGATIVE_BALANCE exactly like POST /transactions", async () => {
    const user = await newUser();
    const account = await createAccount(user, { initial_balance: 1000 });
    const template = await makeTemplate(user, { amount: 5000, account_id: account.id });

    const json = await (await recordFrom(user, template.id)).json();

    expect(json.data.account_balance_after).toBe(-4000);
    expect(json.data.warnings).toEqual([
      { code: "NEGATIVE_BALANCE", account_id: account.id, balance_after: -4000 },
    ]);
  });
});

describe("POST /templates/:id/record: overrides", () => {
  it("overrides apply to the transaction and leave the template untouched", async () => {
    const user = await newUser();
    const first = await createAccount(user);
    const second = await createAccount(user, { initial_balance: 50_000 });
    const category = await categoryId(user, "Makanan", "OUTCOME");
    const template = await makeTemplate(user, {
      transaction_name: "Lunch",
      amount: 35_000,
      account_id: first.id,
      category_id: category,
      note: "plain",
      tags: ["work"],
    });

    const res = await recordFrom(user, template.id, {
      name: "Lunch with a drink",
      amount: 38_000,
      date: "2026-11-14T05:00:00Z",
      account_id: second.id,
      category_id: null,
      note: "With a drink",
      location: "Cafe",
      tags: ["Treat"],
    });
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.data.account_balance_after).toBe(12_000);
    expect(json.data.transaction).toMatchObject({
      name: "Lunch with a drink",
      amount: 38_000,
      date: "2026-11-14T05:00:00.000Z",
      account_id: second.id,
      category_id: null,
      note: "With a drink",
      location: "Cafe",
      tags: ["treat"],
    });

    const after = await getTemplate(user, template.id);
    expect(after).toMatchObject({
      transaction_name: "Lunch",
      amount: 35_000,
      account_id: first.id,
      category_id: category,
      note: "plain",
      tags: ["work"],
      use_count: 1,
    });
  });

  it("a category override of null removes the template's category", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const category = await categoryId(user, "Makanan", "OUTCOME");
    const template = await makeTemplate(user, {
      amount: 1000,
      account_id: account.id,
      category_id: category,
    });

    const json = await (await recordFrom(user, template.id, { category_id: null })).json();

    expect(json.data.transaction.category_id).toBeNull();
  });
});

describe("POST /templates/:id/record: incomplete templates", () => {
  it("422 BUSINESS_RULE listing what is missing, and nothing is recorded or counted", async () => {
    const user = await newUser();
    const template = await makeTemplate(user);

    const res = await recordFrom(user, template.id, {});
    const json = await res.json();

    expect(res.status).toBe(422);
    expect(json.code).toBe("BUSINESS_RULE");
    expect(json.data).toEqual({ missing: ["amount", "account_id"] });
    expect(await transactionRows(user.userId)).toHaveLength(0);
    expect((await getTemplate(user, template.id)).use_count).toBe(0);
  });

  it("the overrides can supply the missing values", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const template = await makeTemplate(user);

    const res = await recordFrom(user, template.id, { amount: 4000, account_id: account.id });

    expect(res.status).toBe(201);
    expect((await res.json()).data.account_balance_after).toBe(96_000);
  });

  it("a transfer template can also miss the destination", async () => {
    const user = await newUser();
    const source = await createAccount(user);
    const target = await createAccount(user);
    const template = await makeTemplate(user, {
      type: "TRANSFER",
      amount: 1000,
      account_id: source.id,
    });

    const missing = await recordFrom(user, template.id, {});
    expect(missing.status).toBe(422);
    expect((await missing.json()).data).toEqual({ missing: ["to_account_id"] });

    const ok = await recordFrom(user, template.id, { to_account_id: target.id });
    expect(ok.status).toBe(201);
  });

  it("an account that was archived is reported as missing", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const template = await makeTemplate(user, { amount: 1000, account_id: account.id });
    await call("POST", `/accounts/${account.id}/archive`, user);

    const res = await recordFrom(user, template.id, {});

    expect(res.status).toBe(422);
    expect((await res.json()).data).toEqual({ missing: ["account_id"] });
  });
});

describe("POST /templates/:id/record: the same rules as POST /transactions", () => {
  it("422 for a future date, 422 for an archived account override, 404 for a foreign one", async () => {
    const user = await newUser();
    const other = await newUser();
    const account = await createAccount(user);
    const archived = await createAccount(user);
    await call("POST", `/accounts/${archived.id}/archive`, user);
    const foreign = await createAccount(other);
    const template = await makeTemplate(user, { amount: 1000, account_id: account.id });
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    expect((await recordFrom(user, template.id, { date: tomorrow })).status).toBe(422);
    expect((await recordFrom(user, template.id, { account_id: archived.id })).status).toBe(422);
    expect((await recordFrom(user, template.id, { account_id: foreign.id })).status).toBe(404);
    expect(await transactionRows(user.userId)).toHaveLength(0);
    expect((await getTemplate(user, template.id)).use_count).toBe(0);
  });

  it("400 for a category of the wrong type or a destination on a non-transfer", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const other = await createAccount(user);
    const income = await categoryId(user, "Gaji", "INCOME");
    const template = await makeTemplate(user, { amount: 1000, account_id: account.id });

    expect((await recordFrom(user, template.id, { category_id: income })).status).toBe(400);
    expect((await recordFrom(user, template.id, { to_account_id: other.id })).status).toBe(400);
  });

  it("400 for invalid overrides, including fields that cannot be overridden", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const template = await makeTemplate(user, { amount: 1000, account_id: account.id });
    const send = (body: unknown) => recordFrom(user, template.id, body);

    expect((await send({ amount: 0 })).status).toBe(400);
    expect((await send({ amount: 1.5 })).status).toBe(400);
    expect((await send({ name: "" })).status).toBe(400);
    expect((await send({ date: "2026-11-13T03:20:00" })).status).toBe(400);
    expect((await send({ type: "INCOME" })).status).toBe(400);
    expect((await send({ items: [] })).status).toBe(400);
    expect((await send({ admin_fee: 100 })).status).toBe(400);
    expect((await send({ template_id: "TPL001" })).status).toBe(400);
  });

  it("404 for another user's or an unknown template", async () => {
    const owner = await newUser();
    const intruder = await newUser();
    const account = await createAccount(owner);
    const template = await makeTemplate(owner, { amount: 1000, account_id: account.id });

    const foreign = await recordFrom(intruder, template.id, {});
    const unknown = await recordFrom(intruder, "TPL999999", {});

    expect(foreign.status).toBe(404);
    expect(await foreign.json()).toEqual(await unknown.json());
    expect(await transactionRows(owner.userId)).toHaveLength(0);
  });

  it("401 without a token", async () => {
    expect((await recordFrom(undefined as unknown as User, "TPL001", {})).status).toBe(401);
  });
});

describe("POST /templates/:id/record: Idempotency-Key", () => {
  it("a repeated key returns the first result, records once, and counts once", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const template = await makeTemplate(user, { amount: 3000, account_id: account.id });
    const key = crypto.randomUUID();

    const first = await recordFrom(user, template.id, {}, { "idempotency-key": key });
    const second = await recordFrom(user, template.id, {}, { "idempotency-key": key });

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(first.headers.get("idempotent-replayed")).toBeNull();
    expect(second.headers.get("idempotent-replayed")).toBe("true");
    expect((await second.json()).data).toEqual((await first.json()).data);
    expect(await transactionRows(user.userId)).toHaveLength(1);
    expect((await getTemplate(user, template.id)).use_count).toBe(1);
  });

  it("two simultaneous requests with the same key record one transaction", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const template = await makeTemplate(user, { amount: 1000, account_id: account.id });
    const key = crypto.randomUUID();

    const [a, b] = await Promise.all([
      recordFrom(user, template.id, {}, { "idempotency-key": key }),
      recordFrom(user, template.id, {}, { "idempotency-key": key }),
    ]);

    expect([a.status, b.status]).toEqual([201, 201]);
    expect((await a.json()).data.transaction.id).toBe((await b.json()).data.transaction.id);
    expect(await transactionRows(user.userId)).toHaveLength(1);
    expect((await getTemplate(user, template.id)).use_count).toBe(1);
  });

  it("409 when the key was used for another template or for POST /transactions", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const one = await makeTemplate(user, { amount: 1000, account_id: account.id });
    const two = await makeTemplate(user, { amount: 1000, account_id: account.id });
    const key = crypto.randomUUID();

    await recordFrom(user, one.id, {}, { "idempotency-key": key });

    const otherTemplate = await recordFrom(user, two.id, {}, { "idempotency-key": key });
    expect(otherTemplate.status).toBe(409);
    expect((await otherTemplate.json()).code).toBe("CONFLICT");

    const otherRoute = await call(
      "POST",
      "/transactions",
      user,
      { type: "OUTCOME", name: "x", amount: 1, account_id: account.id },
      { "idempotency-key": key },
    );
    expect(otherRoute.status).toBe(409);
    expect(await transactionRows(user.userId)).toHaveLength(1);
    expect((await getTemplate(user, two.id)).use_count).toBe(0);
  });

  it("a failed request does not consume the key", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const template = await makeTemplate(user);
    const key = crypto.randomUUID();

    const failed = await recordFrom(user, template.id, {}, { "idempotency-key": key });
    const retried = await recordFrom(
      user,
      template.id,
      { amount: 1000, account_id: account.id },
      { "idempotency-key": key },
    );

    expect(failed.status).toBe(422);
    expect(retried.status).toBe(201);
    expect(retried.headers.get("idempotent-replayed")).toBeNull();
  });

  it("400 for an empty or too long key", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const template = await makeTemplate(user, { amount: 1000, account_id: account.id });

    expect((await recordFrom(user, template.id, {}, { "idempotency-key": "" })).status).toBe(400);
    expect(
      (await recordFrom(user, template.id, {}, { "idempotency-key": "k".repeat(65) })).status,
    ).toBe(400);
  });
});
