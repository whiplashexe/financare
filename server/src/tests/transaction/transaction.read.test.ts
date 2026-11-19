import { afterAll, describe, expect, it } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { transactions } from "../../db/schema/transactions.js";
import { createUser, deleteUsers, startServer } from "../helpers.js";

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

const record = async (
  user: User,
  accountId: string,
  extra: Record<string, unknown> = {},
) => {
  const res = await call("POST", "/transactions", user, {
    type: "OUTCOME",
    name: "Groceries",
    amount: 1000,
    account_id: accountId,
    ...extra,
  });
  return (await res.json()).data.transaction as Record<string, any>;
};

const list = async (user: User, query = "") => {
  const res = await call("GET", `/transactions${query}`, user);
  return { status: res.status, json: await res.json() };
};

const ids = (json: any) => json.data.map((t: any) => t.id) as string[];

afterAll(async () => {
  try {
    await deleteUsers(emails);
  } finally {
    server.close();
  }
});

describe("GET /transactions/:id", () => {
  it("200: returns the full transaction, the same as the create response", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const created = await record(user, account.id, {
      note: "Soap",
      tags: ["a"],
      items: [{ name: "Soap", total_price: 5000 }],
    });

    const res = await call("GET", `/transactions/${created.id}`, user);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data).toEqual(created);
    expect(json.data.items).toEqual([
      { name: "Soap", quantity: 1, unit: null, total_price: 5000 },
    ]);
  });

  it("a transfer shows its admin fee, and the fee row points to its parent", async () => {
    const user = await newUser();
    const source = await createAccount(user);
    const target = await createAccount(user);
    const transfer = await record(user, source.id, {
      type: "TRANSFER",
      name: "Move",
      to_account_id: target.id,
      admin_fee: 2500,
    });

    const detail = await (await call("GET", `/transactions/${transfer.id}`, user)).json();
    expect(detail.data.admin_fee).toBe(2500);

    const all = await list(user);
    const fee = all.json.data.find((t: any) => t.parent_transaction_id === transfer.id);
    expect(fee).toBeDefined();
    const feeDetail = await (await call("GET", `/transactions/${fee.id}`, user)).json();
    expect(feeDetail.data).toMatchObject({
      type: "OUTCOME",
      amount: 2500,
      parent_transaction_id: transfer.id,
      admin_fee: null,
    });
  });

  it("404 for another user's transaction, with the same body as an unknown id", async () => {
    const owner = await newUser();
    const intruder = await newUser();
    const account = await createAccount(owner);
    const created = await record(owner, account.id);

    const foreign = await call("GET", `/transactions/${created.id}`, intruder);
    const unknown = await call("GET", "/transactions/TRANS999999", intruder);

    expect(foreign.status).toBe(404);
    expect(await foreign.json()).toEqual(await unknown.json());
  });

  it("404 for a transaction in the trash", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const created = await record(user, account.id);
    await db
      .update(transactions)
      .set({ deletedAt: new Date() })
      .where(eq(transactions.id, created.id));

    expect((await call("GET", `/transactions/${created.id}`, user)).status).toBe(404);
  });

  it("401 without a token", async () => {
    expect((await call("GET", "/transactions/TRANS001", undefined)).status).toBe(401);
  });
});

describe("GET /transactions", () => {
  it("lists compact objects newest first, with the pagination block", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const older = await record(user, account.id, { name: "Older", date: "2026-11-01T00:00:00Z" });
    const newer = await record(user, account.id, {
      name: "Newer",
      date: "2026-11-02T00:00:00Z",
      items: [
        { name: "a", total_price: 1 },
        { name: "b", total_price: 2 },
      ],
    });

    const { status, json } = await list(user);

    expect(status).toBe(200);
    expect(json.success).toBe(true);
    expect(ids(json)).toEqual([newer.id, older.id]);
    expect(json.pagination).toEqual({ next_cursor: null, limit: 20 });
    expect(json.data[0]).toEqual({
      id: newer.id,
      type: "OUTCOME",
      name: "Newer",
      amount: 1000,
      date: "2026-11-02T00:00:00.000Z",
      account_id: account.id,
      to_account_id: null,
      category_id: null,
      parent_transaction_id: null,
      tags: [],
      source: "MANUAL",
      images_count: 0,
      items_count: 2,
      thumbnail_url: null,
    });
    expect(json.data[0].items).toBeUndefined();
    expect(json.data[0].note).toBeUndefined();
  });

  it("an empty list", async () => {
    const user = await newUser();

    const { json } = await list(user);

    expect(json.data).toEqual([]);
    expect(json.pagination).toEqual({ next_cursor: null, limit: 20 });
  });

  it("never shows another user's transactions or trashed ones", async () => {
    const owner = await newUser();
    const other = await newUser();
    const ownerAccount = await createAccount(owner);
    const otherAccount = await createAccount(other);
    const kept = await record(owner, ownerAccount.id);
    const trashed = await record(owner, ownerAccount.id);
    await record(other, otherAccount.id);
    await db
      .update(transactions)
      .set({ deletedAt: new Date() })
      .where(eq(transactions.id, trashed.id));

    const { json } = await list(owner);

    expect(ids(json)).toEqual([kept.id]);
  });

  describe("pagination", () => {
    it("pages through everything once, newest first, without gaps or repeats", async () => {
      const user = await newUser();
      const account = await createAccount(user);
      const created: string[] = [];
      for (let i = 0; i < 7; i++) {
        const t = await record(user, account.id, {
          name: `T${i}`,
          date: `2026-10-${String(10 + i).padStart(2, "0")}T00:00:00Z`,
        });
        created.push(t.id);
      }

      const seen: string[] = [];
      let cursor: string | null = null;
      let pages = 0;
      do {
        const { json } = await list(user, `?limit=3${cursor ? `&cursor=${cursor}` : ""}`);
        expect(json.pagination.limit).toBe(3);
        seen.push(...ids(json));
        cursor = json.pagination.next_cursor;
        pages++;
      } while (cursor);

      expect(pages).toBe(3);
      expect(seen).toEqual([...created].reverse());
    });

    it("next_cursor is null on an exact last page", async () => {
      const user = await newUser();
      const account = await createAccount(user);
      for (let i = 0; i < 4; i++) await record(user, account.id);

      const { json } = await list(user, "?limit=4");

      expect(json.data).toHaveLength(4);
      expect(json.pagination.next_cursor).toBeNull();
    });

    it("transactions with the same date keep a stable order across pages", async () => {
      const user = await newUser();
      const account = await createAccount(user);
      const created: string[] = [];
      for (let i = 0; i < 5; i++) {
        const t = await record(user, account.id, { date: "2026-10-10T00:00:00Z" });
        created.push(t.id);
      }

      const first = await list(user, "?limit=2");
      const second = await list(user, `?limit=2&cursor=${first.json.pagination.next_cursor}`);
      const third = await list(user, `?limit=2&cursor=${second.json.pagination.next_cursor}`);

      expect([...ids(first.json), ...ids(second.json), ...ids(third.json)]).toEqual(
        [...created].reverse(),
      );
    });

    it("400 for an unknown or foreign cursor, and for a bad limit", async () => {
      const owner = await newUser();
      const other = await newUser();
      const account = await createAccount(owner);
      const created = await record(owner, account.id);

      expect((await list(owner, "?cursor=TRANS999999")).status).toBe(400);
      expect((await list(other, `?cursor=${created.id}`)).status).toBe(400);
      expect((await list(owner, "?limit=0")).status).toBe(400);
      expect((await list(owner, "?limit=101")).status).toBe(400);
      expect((await list(owner, "?limit=abc")).status).toBe(400);
      expect((await list(owner, "?limit=100")).status).toBe(200);
    });
  });

  describe("filters", () => {
    it("by type", async () => {
      const user = await newUser();
      const source = await createAccount(user);
      const target = await createAccount(user);
      const outcome = await record(user, source.id);
      const income = await record(user, source.id, { type: "INCOME", name: "Pay" });
      const transfer = await record(user, source.id, {
        type: "TRANSFER",
        name: "Move",
        to_account_id: target.id,
      });

      expect(ids((await list(user, "?type=OUTCOME")).json)).toEqual([outcome.id]);
      expect(ids((await list(user, "?type=INCOME")).json)).toEqual([income.id]);
      expect(ids((await list(user, "?type=TRANSFER")).json)).toEqual([transfer.id]);
      expect((await list(user, "?type=REFUND")).status).toBe(400);
    });

    it("by account, matching the source or the destination of a transfer", async () => {
      const user = await newUser();
      const a = await createAccount(user);
      const b = await createAccount(user);
      const c = await createAccount(user);
      const onA = await record(user, a.id);
      const transfer = await record(user, b.id, {
        type: "TRANSFER",
        name: "Move",
        to_account_id: a.id,
      });
      await record(user, c.id);

      const json = (await list(user, `?account_id=${a.id}`)).json;

      expect(ids(json).sort()).toEqual([onA.id, transfer.id].sort());
      expect(ids((await list(user, `?account_id=${c.id}`)).json)).toHaveLength(1);
    });

    it("by category", async () => {
      const user = await newUser();
      const account = await createAccount(user);
      const food = await categoryId(user, "Makanan", "OUTCOME");
      const bills = await categoryId(user, "Tagihan", "OUTCOME");
      const inFood = await record(user, account.id, { category_id: food });
      await record(user, account.id, { category_id: bills });
      await record(user, account.id);

      expect(ids((await list(user, `?category_id=${food}`)).json)).toEqual([inFood.id]);
    });

    it("by tag, ignoring case", async () => {
      const user = await newUser();
      const account = await createAccount(user);
      const tagged = await record(user, account.id, { tags: ["Monthly", "food"] });
      await record(user, account.id, { tags: ["other"] });
      await record(user, account.id);

      expect(ids((await list(user, "?tag=MONTHLY")).json)).toEqual([tagged.id]);
      expect(ids((await list(user, "?tag=food")).json)).toEqual([tagged.id]);
      expect(ids((await list(user, "?tag=none")).json)).toEqual([]);
    });

    it("search q matches the name, the note, and item names, ignoring case", async () => {
      const user = await newUser();
      const account = await createAccount(user);
      const byName = await record(user, account.id, { name: "Coffee beans" });
      const byNote = await record(user, account.id, { name: "Shop", note: "bought COFFEE filter" });
      const byItem = await record(user, account.id, {
        name: "Market",
        items: [{ name: "Instant coffee", total_price: 1000 }],
      });
      await record(user, account.id, { name: "Rent" });

      const found = ids((await list(user, "?q=coffee")).json).sort();

      expect(found).toEqual([byName.id, byNote.id, byItem.id].sort());
    });

    it("search q treats % and _ literally", async () => {
      const user = await newUser();
      const account = await createAccount(user);
      const literal = await record(user, account.id, { name: "50% off" });
      await record(user, account.id, { name: "Plain" });

      expect(ids((await list(user, "?q=%25")).json)).toEqual([literal.id]);
      expect(ids((await list(user, "?q=_")).json)).toEqual([]);
    });

    it("by an instant range, inclusive on both ends", async () => {
      const user = await newUser();
      const account = await createAccount(user);
      await record(user, account.id, { name: "Before", date: "2026-11-01T00:00:00Z" });
      const start = await record(user, account.id, { name: "Start", date: "2026-11-05T00:00:00Z" });
      const middle = await record(user, account.id, { name: "Middle", date: "2026-11-06T12:00:00Z" });
      const end = await record(user, account.id, { name: "End", date: "2026-11-08T00:00:00Z" });
      await record(user, account.id, { name: "After", date: "2026-11-09T00:00:00Z" });

      const json = (
        await list(user, "?from=2026-11-05T00:00:00Z&to=2026-11-08T00:00:00Z")
      ).json;

      expect(ids(json)).toEqual([end.id, middle.id, start.id]);
    });

    it("an instant range accepts an offset", async () => {
      const user = await newUser();
      const account = await createAccount(user);
      const inside = await record(user, account.id, { date: "2026-11-05T01:30:00Z" });
      await record(user, account.id, { date: "2026-11-05T00:30:00Z" });

      const json = (await list(user, "?from=2026-11-05T09:00:00%2B08:00")).json;

      expect(ids(json)).toEqual([inside.id]);
    });

    it("a date-only range uses the user's timezone and includes the whole last day", async () => {
      const user = await newUser();
      const account = await createAccount(user);
      const lateEvening = await record(user, account.id, {
        name: "Nov 10 late",
        date: "2026-11-10T16:30:00Z",
      });
      const earlyMorning = await record(user, account.id, {
        name: "Nov 11 early",
        date: "2026-11-10T17:30:00Z",
      });
      const endOfDay = await record(user, account.id, {
        name: "Nov 11 end",
        date: "2026-11-11T16:30:00Z",
      });
      const nextDay = await record(user, account.id, {
        name: "Nov 12",
        date: "2026-11-11T17:30:00Z",
      });

      const onTheEleventh = (await list(user, "?from=2026-11-11&to=2026-11-11")).json;
      expect(ids(onTheEleventh).sort()).toEqual([earlyMorning.id, endOfDay.id].sort());

      const upToTenth = (await list(user, "?to=2026-11-10")).json;
      expect(ids(upToTenth)).toEqual([lateEvening.id]);

      const fromTwelfth = (await list(user, "?from=2026-11-12")).json;
      expect(ids(fromTwelfth)).toEqual([nextDay.id]);
    });

    it("the date-only range follows a changed timezone", async () => {
      const user = await newUser();
      const account = await createAccount(user);
      const created = await record(user, account.id, { date: "2026-11-10T16:30:00Z" });

      expect(ids((await list(user, "?from=2026-11-11&to=2026-11-11")).json)).toEqual([]);

      await call("PATCH", "/me", user, { timezone: "UTC" });
      expect(ids((await list(user, "?from=2026-11-10&to=2026-11-10")).json)).toEqual([created.id]);
    });

    it("400 for a bad date, or when from is after to", async () => {
      const user = await newUser();

      expect((await list(user, "?from=yesterday")).status).toBe(400);
      expect((await list(user, "?from=2026-13-01")).status).toBe(400);
      expect((await list(user, "?to=2026-11-13T03:20:00")).status).toBe(400);
      expect((await list(user, "?from=2026-11-10&to=2026-11-09")).status).toBe(400);
      expect(
        (await list(user, "?from=2026-11-10T10:00:00Z&to=2026-11-10T09:00:00Z")).status,
      ).toBe(400);
    });

    it("filters combine, and unknown parameters are rejected", async () => {
      const user = await newUser();
      const account = await createAccount(user);
      const food = await categoryId(user, "Makanan", "OUTCOME");
      const match = await record(user, account.id, {
        name: "Lunch",
        category_id: food,
        tags: ["work"],
        date: "2026-11-05T05:00:00Z",
      });
      await record(user, account.id, { name: "Lunch", category_id: food, date: "2026-11-05T05:00:00Z" });
      await record(user, account.id, { name: "Dinner", tags: ["work"], date: "2026-11-05T05:00:00Z" });

      const json = (
        await list(user, `?type=OUTCOME&category_id=${food}&tag=work&q=lunch&from=2026-11-05&to=2026-11-05`)
      ).json;

      expect(ids(json)).toEqual([match.id]);
      expect((await list(user, "?page=2")).status).toBe(400);
      expect((await list(user, "?user_id=USR001")).status).toBe(400);
    });
  });

  it("401 without a token", async () => {
    expect((await call("GET", "/transactions", undefined)).status).toBe(401);
  });
});
