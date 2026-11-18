import { afterAll, describe, expect, it } from "bun:test";
import {
  createUser,
  deleteUsers,
  insertRecurringPlan,
  insertTemplate,
  insertTransaction,
  planRow,
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
) =>
  server.request({
    method,
    path,
    body,
    headers: user ? { authorization: `Bearer ${user.accessToken}` } : {},
  });

const listCategories = async (user: User, query = "") => {
  const json = await (await call("GET", `/categories${query}`, user)).json();
  return json.data as Record<string, any>[];
};

const findByName = async (
  user: User,
  name: string,
  type: "INCOME" | "OUTCOME" = "OUTCOME",
) => {
  const all = await listCategories(user);
  return all.find((c) => c.name === name && c.type === type)!;
};

const createAccount = async (user: User) => {
  const res = await call("POST", "/accounts", user, {
    name: `Account ${crypto.randomUUID().slice(0, 8)}`,
    type: "BANK",
  });
  return (await res.json()).data.id as string;
};

afterAll(async () => {
  try {
    await deleteUsers(emails);
  } finally {
    server.close();
  }
});

describe("GET /categories", () => {
  it("returns the 10 seeded categories of a new user", async () => {
    const user = await newUser();

    const res = await call("GET", "/categories", user);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data).toHaveLength(10);
    expect(json.data.filter((c: any) => c.type === "OUTCOME")).toHaveLength(8);
    expect(json.data.filter((c: any) => c.type === "INCOME")).toHaveLength(2);
    expect(json.data[0]).toEqual({
      id: expect.stringMatching(/^CAT\d{3,}$/),
      name: expect.any(String),
      type: expect.stringMatching(/^(INCOME|OUTCOME)$/),
      icon: expect.any(String),
      is_default: true,
      is_fallback: expect.any(Boolean),
    });
  });

  it("filters by type", async () => {
    const user = await newUser();

    const outcome = await listCategories(user, "?type=OUTCOME");
    const income = await listCategories(user, "?type=INCOME");

    expect(outcome).toHaveLength(8);
    expect(outcome.every((c) => c.type === "OUTCOME")).toBe(true);
    expect(income).toHaveLength(2);
    expect(income.every((c) => c.type === "INCOME")).toBe(true);
  });

  it("puts the fallback category last within each type", async () => {
    const user = await newUser();

    for (const type of ["OUTCOME", "INCOME"]) {
      const rows = await listCategories(user, `?type=${type}`);
      expect(rows.at(-1)!.is_fallback).toBe(true);
      expect(rows.slice(0, -1).every((c) => !c.is_fallback)).toBe(true);
    }
  });

  it("has exactly one fallback per type", async () => {
    const user = await newUser();

    const all = await listCategories(user);

    expect(all.filter((c) => c.is_fallback && c.type === "OUTCOME")).toHaveLength(1);
    expect(all.filter((c) => c.is_fallback && c.type === "INCOME")).toHaveLength(1);
  });

  it("400 for an unknown type or query parameter", async () => {
    const user = await newUser();

    expect((await call("GET", "/categories?type=TRANSFER", user)).status).toBe(400);
    expect((await call("GET", "/categories?page=2", user)).status).toBe(400);
  });

  it("never shows another user's categories", async () => {
    const owner = await newUser();
    const other = await newUser();
    const created = await (
      await call("POST", "/categories", owner, { name: "Secret", type: "OUTCOME" })
    ).json();

    const rows = await listCategories(other);

    expect(rows.map((c) => c.id)).not.toContain(created.data.id);
    expect(rows).toHaveLength(10);
  });

  it("401 without a token", async () => {
    expect((await call("GET", "/categories", undefined)).status).toBe(401);
  });
});

describe("POST /categories", () => {
  it("201: creates a custom category", async () => {
    const user = await newUser();

    const res = await call("POST", "/categories", user, {
      name: "  Pets  ",
      type: "OUTCOME",
      icon: "paw-print",
    });
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.data).toEqual({
      id: expect.stringMatching(/^CAT\d{3,}$/),
      name: "Pets",
      type: "OUTCOME",
      icon: "paw-print",
      is_default: false,
      is_fallback: false,
    });
    expect(await listCategories(user)).toHaveLength(11);
  });

  it("the icon is optional", async () => {
    const user = await newUser();

    const res = await call("POST", "/categories", user, { name: "Bonus", type: "INCOME" });

    expect(res.status).toBe(201);
    expect((await res.json()).data.icon).toBeNull();
  });

  it("allows the same name under the other type", async () => {
    const user = await newUser();

    expect((await call("POST", "/categories", user, { name: "Gifts", type: "OUTCOME" })).status).toBe(201);
    expect((await call("POST", "/categories", user, { name: "Gifts", type: "INCOME" })).status).toBe(201);
  });

  it("409 for a duplicate name of the same type, ignoring case", async () => {
    const user = await newUser();
    await call("POST", "/categories", user, { name: "Pets", type: "OUTCOME" });

    const duplicate = await call("POST", "/categories", user, { name: "pETS", type: "OUTCOME" });
    const json = await duplicate.json();

    expect(duplicate.status).toBe(409);
    expect(json.code).toBe("CONFLICT");
  });

  it("409 for the name of a seeded category", async () => {
    const user = await newUser();
    const seeded = (await listCategories(user, "?type=OUTCOME"))[0]!;

    const res = await call("POST", "/categories", user, {
      name: seeded.name.toUpperCase(),
      type: "OUTCOME",
    });

    expect(res.status).toBe(409);
  });

  it("two users may use the same name", async () => {
    const first = await newUser();
    const second = await newUser();

    expect((await call("POST", "/categories", first, { name: "Shared", type: "OUTCOME" })).status).toBe(201);
    expect((await call("POST", "/categories", second, { name: "Shared", type: "OUTCOME" })).status).toBe(201);
  });

  it("accepts names of 50 characters and icons of 50 characters", async () => {
    const user = await newUser();

    const res = await call("POST", "/categories", user, {
      name: "n".repeat(50),
      type: "OUTCOME",
      icon: "i".repeat(50),
    });

    expect(res.status).toBe(201);
  });

  it("400: invalid values, with errors per field", async () => {
    const user = await newUser();
    const create = (body: unknown) => call("POST", "/categories", user, body);

    const bad = await create({ name: "", type: "TRANSFER" });
    const json = await bad.json();
    expect(bad.status).toBe(400);
    expect(json.code).toBe("VALIDATION_ERROR");
    expect(Object.keys(json.errors)).toEqual(expect.arrayContaining(["name", "type"]));

    expect((await create({ name: "   ", type: "OUTCOME" })).status).toBe(400);
    expect((await create({ name: "n".repeat(51), type: "OUTCOME" })).status).toBe(400);
    expect((await create({ name: "a", type: "OUTCOME", icon: "i".repeat(51) })).status).toBe(400);
    expect((await create({ name: "a", type: "OUTCOME", icon: "" })).status).toBe(400);
    expect((await create({ type: "OUTCOME" })).status).toBe(400);
    expect((await create({ name: "a" })).status).toBe(400);
  });

  it("400: fields the client may not set", async () => {
    const user = await newUser();
    const create = (extra: Record<string, unknown>) =>
      call("POST", "/categories", user, { name: "Valid", type: "OUTCOME", ...extra });

    expect((await create({ is_default: true })).status).toBe(400);
    expect((await create({ is_fallback: true })).status).toBe(400);
    expect((await create({ user_id: "USR001" })).status).toBe(400);
    expect((await create({ id: "CAT001" })).status).toBe(400);
  });

  it("400 without a body, 401 without a token", async () => {
    const user = await newUser();

    expect((await call("POST", "/categories", user)).status).toBe(400);
    expect((await call("POST", "/categories", undefined, { name: "a", type: "OUTCOME" })).status).toBe(401);
  });
});

describe("PATCH /categories/:id", () => {
  it("200: renames and changes the icon", async () => {
    const user = await newUser();
    const created = (
      await (await call("POST", "/categories", user, { name: "Pets", type: "OUTCOME" })).json()
    ).data;

    const res = await call("PATCH", `/categories/${created.id}`, user, {
      name: "  Animals  ",
      icon: "paw",
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toEqual({ ...created, name: "Animals", icon: "paw" });
  });

  it("changes only the given field, and null clears the icon", async () => {
    const user = await newUser();
    const created = (
      await (
        await call("POST", "/categories", user, { name: "Pets", type: "OUTCOME", icon: "paw" })
      ).json()
    ).data;

    const renamed = await call("PATCH", `/categories/${created.id}`, user, { name: "Animals" });
    expect((await renamed.json()).data).toMatchObject({ name: "Animals", icon: "paw" });

    const cleared = await call("PATCH", `/categories/${created.id}`, user, { icon: null });
    expect((await cleared.json()).data).toMatchObject({ name: "Animals", icon: null });
  });

  it("a seeded category that is not the fallback can be renamed", async () => {
    const user = await newUser();
    const food = (await listCategories(user, "?type=OUTCOME"))[0]!;
    expect(food.is_fallback).toBe(false);

    const res = await call("PATCH", `/categories/${food.id}`, user, { name: "Groceries" });

    expect(res.status).toBe(200);
    expect((await res.json()).data).toMatchObject({ name: "Groceries", is_default: true });
  });

  it("409 when renaming to a name that exists in the same type, ignoring case", async () => {
    const user = await newUser();
    const [first, second] = await listCategories(user, "?type=OUTCOME");

    const res = await call("PATCH", `/categories/${second!.id}`, user, {
      name: first!.name.toLowerCase(),
    });

    expect(res.status).toBe(409);
  });

  it("allows renaming to the same name, and to another type's name", async () => {
    const user = await newUser();
    const created = (
      await (await call("POST", "/categories", user, { name: "Pets", type: "OUTCOME" })).json()
    ).data;
    const incomeName = (await listCategories(user, "?type=INCOME"))[0]!.name;

    expect((await call("PATCH", `/categories/${created.id}`, user, { name: "Pets" })).status).toBe(200);
    expect((await call("PATCH", `/categories/${created.id}`, user, { name: incomeName })).status).toBe(200);
  });

  it("422 BUSINESS_RULE when renaming the fallback category, which keeps its name", async () => {
    const user = await newUser();
    const fallback = await findByName(user, "Lainnya", "OUTCOME");

    const res = await call("PATCH", `/categories/${fallback.id}`, user, { name: "Misc" });
    const json = await res.json();

    expect(res.status).toBe(422);
    expect(json.code).toBe("BUSINESS_RULE");
    expect((await findByName(user, "Lainnya", "OUTCOME")).id).toBe(fallback.id);
  });

  it("the fallback category may change its icon, and a rename to its own name is a no-op", async () => {
    const user = await newUser();
    const fallback = await findByName(user, "Lainnya", "INCOME");

    const icon = await call("PATCH", `/categories/${fallback.id}`, user, { icon: "star" });
    expect(icon.status).toBe(200);
    expect((await icon.json()).data).toMatchObject({ icon: "star", is_fallback: true });

    const same = await call("PATCH", `/categories/${fallback.id}`, user, { name: "Lainnya" });
    expect(same.status).toBe(200);
  });

  it("400: the type cannot be changed, and other fields are rejected", async () => {
    const user = await newUser();
    const created = (
      await (await call("POST", "/categories", user, { name: "Pets", type: "OUTCOME" })).json()
    ).data;
    const patch = (body: unknown) => call("PATCH", `/categories/${created.id}`, user, body);

    expect((await patch({ type: "INCOME" })).status).toBe(400);
    expect((await patch({ is_default: true })).status).toBe(400);
    expect((await patch({ is_fallback: true })).status).toBe(400);
    expect((await patch({})).status).toBe(400);
    expect((await patch({ name: "" })).status).toBe(400);
    expect((await patch({ name: "n".repeat(51) })).status).toBe(400);
  });

  it("404 for another user's category, and it is left untouched", async () => {
    const owner = await newUser();
    const intruder = await newUser();
    const created = (
      await (await call("POST", "/categories", owner, { name: "Private", type: "OUTCOME" })).json()
    ).data;

    const foreign = await call("PATCH", `/categories/${created.id}`, intruder, { name: "Hacked" });
    const unknown = await call("PATCH", "/categories/CAT999999", intruder, { name: "Hacked" });

    expect(foreign.status).toBe(404);
    expect(await foreign.json()).toEqual(await unknown.json());
    expect((await findByName(owner, "Private")).id).toBe(created.id);
  });

  it("401 without a token", async () => {
    expect((await call("PATCH", "/categories/CAT001", undefined, { name: "x" })).status).toBe(401);
  });
});

describe("DELETE /categories/:id", () => {
  it("200 with moved_transactions: 0 for a category nobody uses, and no confirmation is needed", async () => {
    const user = await newUser();
    const created = (
      await (await call("POST", "/categories", user, { name: "Unused", type: "OUTCOME" })).json()
    ).data;

    const res = await call("DELETE", `/categories/${created.id}`, user);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toEqual({ moved_transactions: 0 });
    expect(await listCategories(user)).toHaveLength(10);
  });

  it("422 CONFIRMATION_REQUIRED with the affected count, and nothing changes", async () => {
    const user = await newUser();
    const accountId = await createAccount(user);
    const food = await findByName(user, "Makanan");
    for (let i = 0; i < 3; i++) {
      await insertTransaction({
        userId: user.userId,
        accountId,
        type: "OUTCOME",
        amount: 1000,
        categoryId: food.id,
      });
    }

    const res = await call("DELETE", `/categories/${food.id}`, user);
    const json = await res.json();

    expect(res.status).toBe(422);
    expect(json.code).toBe("CONFIRMATION_REQUIRED");
    expect(json.data).toEqual({ affected_transactions: 3 });
    expect((await findByName(user, "Makanan")).id).toBe(food.id);
    const rows = await transactionRows(user.userId);
    expect(rows.every((t) => t.categoryId === food.id)).toBe(true);
  });

  it("confirm=false behaves like no confirmation", async () => {
    const user = await newUser();
    const accountId = await createAccount(user);
    const food = await findByName(user, "Makanan");
    await insertTransaction({
      userId: user.userId,
      accountId,
      type: "OUTCOME",
      amount: 1000,
      categoryId: food.id,
    });

    const res = await call("DELETE", `/categories/${food.id}?confirm=false`, user);

    expect(res.status).toBe(422);
  });

  it("with confirm=true moves the transactions to the fallback category of the same type", async () => {
    const user = await newUser();
    const accountId = await createAccount(user);
    const food = await findByName(user, "Makanan");
    const transport = await findByName(user, "Transportasi");
    const fallback = await findByName(user, "Lainnya", "OUTCOME");
    for (let i = 0; i < 2; i++) {
      await insertTransaction({
        userId: user.userId,
        accountId,
        type: "OUTCOME",
        amount: 1000,
        categoryId: food.id,
      });
    }
    await insertTransaction({
      userId: user.userId,
      accountId,
      type: "OUTCOME",
      amount: 500,
      categoryId: transport.id,
    });

    const res = await call("DELETE", `/categories/${food.id}?confirm=true`, user);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toEqual({ moved_transactions: 2 });

    const names = (await listCategories(user)).map((c) => c.id);
    expect(names).not.toContain(food.id);

    const rows = await transactionRows(user.userId);
    expect(rows.filter((t) => t.categoryId === fallback.id)).toHaveLength(2);
    expect(rows.filter((t) => t.categoryId === transport.id)).toHaveLength(1);
    expect(rows.every((t) => t.categoryId !== null)).toBe(true);
  });

  it("an income category moves to the income fallback, not the outcome one", async () => {
    const user = await newUser();
    const accountId = await createAccount(user);
    const salary = await findByName(user, "Gaji", "INCOME");
    const incomeFallback = await findByName(user, "Lainnya", "INCOME");
    await insertTransaction({
      userId: user.userId,
      accountId,
      type: "INCOME",
      amount: 5000,
      categoryId: salary.id,
    });

    const res = await call("DELETE", `/categories/${salary.id}?confirm=true`, user);

    expect(res.status).toBe(200);
    const rows = await transactionRows(user.userId);
    expect(rows[0]!.categoryId).toBe(incomeFallback.id);
  });

  it("also moves transactions that are in the trash", async () => {
    const user = await newUser();
    const accountId = await createAccount(user);
    const food = await findByName(user, "Makanan");
    const fallback = await findByName(user, "Lainnya", "OUTCOME");
    await insertTransaction({
      userId: user.userId,
      accountId,
      type: "OUTCOME",
      amount: 1000,
      categoryId: food.id,
      deleted: true,
    });

    const res = await call("DELETE", `/categories/${food.id}?confirm=true`, user);

    expect((await res.json()).data).toEqual({ moved_transactions: 1 });
    expect((await transactionRows(user.userId))[0]!.categoryId).toBe(fallback.id);
  });

  it("re-points templates and recurring plans to the fallback category too", async () => {
    const user = await newUser();
    const accountId = await createAccount(user);
    const food = await findByName(user, "Makanan");
    const transport = await findByName(user, "Transportasi");
    const fallback = await findByName(user, "Lainnya", "OUTCOME");
    const templateId = await insertTemplate({ userId: user.userId, categoryId: food.id });
    const otherTemplateId = await insertTemplate({ userId: user.userId, categoryId: transport.id });
    const planId = await insertRecurringPlan({ userId: user.userId, accountId, categoryId: food.id });

    const res = await call("DELETE", `/categories/${food.id}`, user);

    expect(res.status).toBe(200);
    expect((await templateRow(templateId)).categoryId).toBe(fallback.id);
    expect((await templateRow(otherTemplateId)).categoryId).toBe(transport.id);
    expect((await planRow(planId)).categoryId).toBe(fallback.id);
  });

  it("422 BUSINESS_RULE for the fallback category, even with confirm=true", async () => {
    const user = await newUser();
    const fallback = await findByName(user, "Lainnya", "OUTCOME");

    const plain = await call("DELETE", `/categories/${fallback.id}`, user);
    const confirmed = await call("DELETE", `/categories/${fallback.id}?confirm=true`, user);

    expect(plain.status).toBe(422);
    expect((await plain.json()).code).toBe("BUSINESS_RULE");
    expect(confirmed.status).toBe(422);
    expect((await findByName(user, "Lainnya", "OUTCOME")).id).toBe(fallback.id);
  });

  it("400 for an invalid confirm value or an unknown query parameter", async () => {
    const user = await newUser();
    const created = (
      await (await call("POST", "/categories", user, { name: "Temp", type: "OUTCOME" })).json()
    ).data;

    expect((await call("DELETE", `/categories/${created.id}?confirm=yes`, user)).status).toBe(400);
    expect((await call("DELETE", `/categories/${created.id}?force=true`, user)).status).toBe(400);
  });

  it("404 for another user's category, which stays", async () => {
    const owner = await newUser();
    const intruder = await newUser();
    const created = (
      await (await call("POST", "/categories", owner, { name: "Private", type: "OUTCOME" })).json()
    ).data;

    const res = await call("DELETE", `/categories/${created.id}?confirm=true`, intruder);

    expect(res.status).toBe(404);
    expect((await findByName(owner, "Private")).id).toBe(created.id);
  });

  it("404 when deleted twice, and 401 without a token", async () => {
    const user = await newUser();
    const created = (
      await (await call("POST", "/categories", user, { name: "Temp", type: "OUTCOME" })).json()
    ).data;

    await call("DELETE", `/categories/${created.id}`, user);

    expect((await call("DELETE", `/categories/${created.id}`, user)).status).toBe(404);
    expect((await call("DELETE", "/categories/CAT001", undefined)).status).toBe(401);
  });

  it("a deleted name can be used again", async () => {
    const user = await newUser();
    const created = (
      await (await call("POST", "/categories", user, { name: "Temp", type: "OUTCOME" })).json()
    ).data;
    await call("DELETE", `/categories/${created.id}`, user);

    expect((await call("POST", "/categories", user, { name: "Temp", type: "OUTCOME" })).status).toBe(201);
  });
});
