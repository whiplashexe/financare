import { afterAll, describe, expect, it } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { transactionItems } from "../../db/schema/transaction.items.js";
import { transactions } from "../../db/schema/transactions.js";
import { createUser, deleteUsers, startServer, transactionRows } from "../helpers.js";

const server = startServer();
const emails: string[] = [];
const DAY = 24 * 60 * 60 * 1000;

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

const remove = (user: User, id: string, query = "") =>
  call("DELETE", `/transactions/${id}${query}`, user);
const restore = (user: User, id: string) =>
  call("POST", `/transactions/${id}/restore`, user);
const trash = async (user: User, query = "") => {
  const res = await call("GET", `/transactions/trash${query}`, user);
  return { status: res.status, json: await res.json() };
};
const live = async (user: User) =>
  (await (await call("GET", "/transactions?limit=100", user)).json()).data as Record<string, any>[];
const balanceOf = async (user: User, accountId: string) =>
  (await (await call("GET", `/accounts/${accountId}`, user)).json()).data
    .current_balance as number;
const ids = (json: any) => json.data.map((t: any) => t.id) as string[];
const setDeletedAt = (id: string, at: Date | null) =>
  db.update(transactions).set({ deletedAt: at }).where(eq(transactions.id, id));

afterAll(async () => {
  try {
    await deleteUsers(emails);
  } finally {
    server.close();
  }
});

describe("DELETE /transactions/:id: move to trash", () => {
  it("204: the transaction leaves the list and the detail, and the balance is restored", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const created = await record(user, account.id, { amount: 25_000 });
    expect(await balanceOf(user, account.id)).toBe(75_000);

    const res = await remove(user, created.id);

    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");
    expect(await balanceOf(user, account.id)).toBe(100_000);
    expect(await live(user)).toHaveLength(0);
    expect((await call("GET", `/transactions/${created.id}`, user)).status).toBe(404);
  });

  it("the row is kept with deleted_at set", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const created = await record(user, account.id);

    await remove(user, created.id);

    const rows = await transactionRows(user.userId);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.deletedAt).not.toBeNull();
  });

  it("a transfer takes its admin fee along, and both balances are restored", async () => {
    const user = await newUser();
    const source = await createAccount(user);
    const target = await createAccount(user);
    const created = await record(user, source.id, {
      type: "TRANSFER",
      name: "Move",
      amount: 20_000,
      to_account_id: target.id,
      admin_fee: 1000,
    });
    expect(await balanceOf(user, source.id)).toBe(79_000);

    await remove(user, created.id);

    const rows = await transactionRows(user.userId);
    expect(rows).toHaveLength(2);
    expect(rows.every((t) => t.deletedAt !== null)).toBe(true);
    expect(await balanceOf(user, source.id)).toBe(100_000);
    expect(await balanceOf(user, target.id)).toBe(100_000);
    expect(await live(user)).toHaveLength(0);
  });

  it("404 when it is already in the trash", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const created = await record(user, account.id);

    await remove(user, created.id);

    expect((await remove(user, created.id)).status).toBe(404);
  });

  it("422 when deleting an admin fee directly", async () => {
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

    const soft = await remove(user, fee.id);
    const permanent = await remove(user, fee.id, "?permanent=true");

    expect(soft.status).toBe(422);
    expect((await soft.json()).code).toBe("BUSINESS_RULE");
    expect(permanent.status).toBe(422);
    expect(await transactionRows(user.userId)).toHaveLength(2);
  });

  it("404 for another user's or an unknown transaction, which stays untouched", async () => {
    const owner = await newUser();
    const intruder = await newUser();
    const account = await createAccount(owner);
    const created = await record(owner, account.id);

    const foreign = await remove(intruder, created.id);
    const unknown = await remove(intruder, "TRANS999999");

    expect(foreign.status).toBe(404);
    expect(await foreign.json()).toEqual(await unknown.json());
    expect((await remove(intruder, created.id, "?permanent=true")).status).toBe(404);
    expect(await live(owner)).toHaveLength(1);
  });

  it("400 for an invalid permanent value or an unknown query parameter, and 401 without a token", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const created = await record(user, account.id);

    expect((await remove(user, created.id, "?permanent=yes")).status).toBe(400);
    expect((await remove(user, created.id, "?force=true")).status).toBe(400);
    expect((await call("DELETE", `/transactions/${created.id}`, undefined)).status).toBe(401);
    expect(await live(user)).toHaveLength(1);
  });
});

describe("DELETE /transactions/:id?permanent=true", () => {
  it("204: the transaction, its items and its admin fee are gone for good", async () => {
    const user = await newUser();
    const source = await createAccount(user);
    const target = await createAccount(user);
    const plain = await record(user, source.id, { items: [{ name: "A", total_price: 1 }] });
    const transfer = await record(user, source.id, {
      type: "TRANSFER",
      name: "Move",
      to_account_id: target.id,
      admin_fee: 1000,
    });

    const first = await remove(user, plain.id, "?permanent=true");
    const second = await remove(user, transfer.id, "?permanent=true");

    expect(first.status).toBe(204);
    expect(second.status).toBe(204);
    expect(await transactionRows(user.userId)).toHaveLength(0);
    const items = await db
      .select()
      .from(transactionItems)
      .where(eq(transactionItems.transactionId, plain.id));
    expect(items).toHaveLength(0);
    expect(await balanceOf(user, source.id)).toBe(100_000);
  });

  it("also works from the trash, and it cannot be restored afterwards", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const created = await record(user, account.id);
    await remove(user, created.id);

    const res = await remove(user, created.id, "?permanent=true");

    expect(res.status).toBe(204);
    expect(await transactionRows(user.userId)).toHaveLength(0);
    expect((await restore(user, created.id)).status).toBe(404);
  });

  it("404 the second time", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const created = await record(user, account.id);

    await remove(user, created.id, "?permanent=true");

    expect((await remove(user, created.id, "?permanent=true")).status).toBe(404);
  });

  it("permanent=false behaves like the default", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const created = await record(user, account.id);

    expect((await remove(user, created.id, "?permanent=false")).status).toBe(204);
    expect(await transactionRows(user.userId)).toHaveLength(1);
  });
});

describe("GET /transactions/trash", () => {
  it("lists the trash newest deletion first with deleted_at and permanent_delete_at", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const first = await record(user, account.id, { name: "First" });
    const second = await record(user, account.id, { name: "Second" });
    await remove(user, first.id);
    await new Promise((r) => setTimeout(r, 30));
    await remove(user, second.id);

    const { status, json } = await trash(user);

    expect(status).toBe(200);
    expect(json.success).toBe(true);
    expect(ids(json)).toEqual([second.id, first.id]);
    expect(json.pagination).toEqual({ next_cursor: null, limit: 20 });
    expect(json.data[0]).toMatchObject({
      id: second.id,
      type: "OUTCOME",
      name: "Second",
      amount: 10_000,
      images_count: 0,
      items_count: 0,
    });
    const deletedAt = new Date(json.data[0].deleted_at).getTime();
    const purgeAt = new Date(json.data[0].permanent_delete_at).getTime();
    expect(purgeAt - deletedAt).toBe(30 * DAY);
  });

  it("an empty trash", async () => {
    const user = await newUser();

    const { json } = await trash(user);

    expect(json.data).toEqual([]);
    expect(json.pagination).toEqual({ next_cursor: null, limit: 20 });
  });

  it("shows a transfer once, without its admin fee row", async () => {
    const user = await newUser();
    const source = await createAccount(user);
    const target = await createAccount(user);
    const created = await record(user, source.id, {
      type: "TRANSFER",
      name: "Move",
      to_account_id: target.id,
      admin_fee: 1000,
    });
    await remove(user, created.id);

    const { json } = await trash(user);

    expect(ids(json)).toEqual([created.id]);
  });

  it("does not show live transactions or another user's trash", async () => {
    const owner = await newUser();
    const other = await newUser();
    const ownerAccount = await createAccount(owner);
    const otherAccount = await createAccount(other);
    await record(owner, ownerAccount.id);
    const otherCreated = await record(other, otherAccount.id);
    await remove(other, otherCreated.id);

    const { json } = await trash(owner);

    expect(json.data).toEqual([]);
  });

  it("hides transactions that have been in the trash for more than 30 days", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const recent = await record(user, account.id, { name: "Recent" });
    const old = await record(user, account.id, { name: "Old" });
    await remove(user, recent.id);
    await remove(user, old.id);
    await setDeletedAt(old.id, new Date(Date.now() - 31 * DAY));

    const { json } = await trash(user);

    expect(ids(json)).toEqual([recent.id]);
  });

  it("pages through the trash without gaps or repeats", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const deleted: string[] = [];
    for (let i = 0; i < 5; i++) {
      const created = await record(user, account.id, { name: `T${i}` });
      await remove(user, created.id);
      deleted.push(created.id);
      await new Promise((r) => setTimeout(r, 20));
    }

    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const { json } = await trash(user, `?limit=2${cursor ? `&cursor=${cursor}` : ""}`);
      seen.push(...ids(json));
      cursor = json.pagination.next_cursor;
    } while (cursor);

    expect(seen).toEqual([...deleted].reverse());
  });

  it("400 for an unknown cursor, a live transaction as cursor, a bad limit, or an unknown parameter", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const liveOne = await record(user, account.id);

    expect((await trash(user, "?cursor=TRANS999999")).status).toBe(400);
    expect((await trash(user, `?cursor=${liveOne.id}`)).status).toBe(400);
    expect((await trash(user, "?limit=0")).status).toBe(400);
    expect((await trash(user, "?limit=101")).status).toBe(400);
    expect((await trash(user, "?type=INCOME")).status).toBe(400);
  });

  it("401 without a token", async () => {
    expect((await call("GET", "/transactions/trash", undefined)).status).toBe(401);
  });
});

describe("POST /transactions/:id/restore", () => {
  it("200: returns the transaction and applies its balance again", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const created = await record(user, account.id, {
      amount: 25_000,
      items: [{ name: "A", total_price: 5 }],
    });
    await remove(user, created.id);
    expect(await balanceOf(user, account.id)).toBe(100_000);

    const res = await restore(user, created.id);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data).toEqual(created);
    expect(await balanceOf(user, account.id)).toBe(75_000);
    expect(ids({ data: await live(user) })).toEqual([created.id]);
    expect((await trash(user)).json.data).toEqual([]);
  });

  it("restoring a transfer brings back its admin fee and both balances", async () => {
    const user = await newUser();
    const source = await createAccount(user);
    const target = await createAccount(user);
    const created = await record(user, source.id, {
      type: "TRANSFER",
      name: "Move",
      amount: 20_000,
      to_account_id: target.id,
      admin_fee: 1000,
    });
    await remove(user, created.id);

    const res = await restore(user, created.id);

    expect(res.status).toBe(200);
    expect((await res.json()).data.admin_fee).toBe(1000);
    expect(await balanceOf(user, source.id)).toBe(79_000);
    expect(await balanceOf(user, target.id)).toBe(120_000);
    const rows = await transactionRows(user.userId);
    expect(rows.every((t) => t.deletedAt === null)).toBe(true);
  });

  it("works while the account is archived", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const created = await record(user, account.id);
    await remove(user, created.id);
    await call("POST", `/accounts/${account.id}/archive`, user);

    expect((await restore(user, created.id)).status).toBe(200);
  });

  it("404 for a transaction that is not in the trash, and when restored twice", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const created = await record(user, account.id);

    expect((await restore(user, created.id)).status).toBe(404);

    await remove(user, created.id);
    expect((await restore(user, created.id)).status).toBe(200);
    expect((await restore(user, created.id)).status).toBe(404);
  });

  it("404 after 30 days in the trash, and the balance stays excluded", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const created = await record(user, account.id, { amount: 10_000 });
    await remove(user, created.id);
    await setDeletedAt(created.id, new Date(Date.now() - 31 * DAY));

    const res = await restore(user, created.id);

    expect(res.status).toBe(404);
    expect(await balanceOf(user, account.id)).toBe(100_000);
  });

  it("422 when restoring an admin fee directly", async () => {
    const user = await newUser();
    const source = await createAccount(user);
    const target = await createAccount(user);
    const created = await record(user, source.id, {
      type: "TRANSFER",
      name: "Move",
      to_account_id: target.id,
      admin_fee: 1000,
    });
    await remove(user, created.id);
    const fee = (await transactionRows(user.userId)).find((t) => t.parentTransactionId)!;

    const res = await restore(user, fee.id);

    expect(res.status).toBe(422);
    expect((await res.json()).code).toBe("BUSINESS_RULE");
  });

  it("404 for another user's transaction, which stays in the trash", async () => {
    const owner = await newUser();
    const intruder = await newUser();
    const account = await createAccount(owner);
    const created = await record(owner, account.id);
    await remove(owner, created.id);

    const foreign = await restore(intruder, created.id);
    const unknown = await restore(intruder, "TRANS999999");

    expect(foreign.status).toBe(404);
    expect(await foreign.json()).toEqual(await unknown.json());
    expect(ids((await trash(owner)).json)).toEqual([created.id]);
  });

  it("401 without a token", async () => {
    expect((await restore(undefined as unknown as User, "TRANS001")).status).toBe(401);
  });
});
