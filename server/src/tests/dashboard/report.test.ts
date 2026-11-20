import { afterAll, describe, expect, it } from "bun:test";
import { createUser, dayInJakarta, deleteUsers, startServer } from "../helpers.js";

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
    initial_balance: 10_000_000,
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
    name: "Spend",
    amount: 1000,
    account_id: accountId,
    ...extra,
  });
  return (await res.json()).data.transaction as Record<string, any>;
};

const get = async (user: User, path: string) => {
  const res = await call("GET", path, user);
  return { status: res.status, json: await res.json() };
};

const month = dayInJakarta(0).slice(0, 7);
const monthsAgo = (n: number) => {
  const d = new Date(`${month}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - n);
  return d.toISOString().slice(0, 7);
};
const monthStart = `${month}-01T00:00:00+07:00`;

afterAll(async () => {
  try {
    await deleteUsers(emails);
  } finally {
    server.close();
  }
});

describe("GET /reports/outcome-by-category", () => {
  it("totals the outcome per category with its share, biggest first", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const food = await categoryId(user, "Makanan", "OUTCOME");
    const transport = await categoryId(user, "Transportasi", "OUTCOME");
    await record(user, account.id, { amount: 10_000, category_id: food });
    await record(user, account.id, { amount: 20_000, category_id: food });
    await record(user, account.id, { amount: 10_000, category_id: transport });
    await record(user, account.id, { amount: 10_000 });

    const { status, json } = await get(user, "/reports/outcome-by-category");

    expect(status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data).toEqual([
      { category_id: food, name: "Makanan", total: 30_000, percent: 60 },
      { category_id: transport, name: "Transportasi", total: 10_000, percent: 20 },
      { category_id: null, name: "Uncategorized", total: 10_000, percent: 20 },
    ]);
  });

  it("the shares add up to about 100 and are rounded to one decimal", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    for (const name of ["Makanan", "Transportasi", "Tagihan"]) {
      await record(user, account.id, { amount: 1000, category_id: await categoryId(user, name, "OUTCOME") });
    }

    const { json } = await get(user, "/reports/outcome-by-category");

    expect(json.data.map((row: any) => row.percent)).toEqual([33.3, 33.3, 33.3]);
  });

  it("counts a transfer's admin fee under the Biaya Admin category, and never the transfer itself", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const other = await createAccount(user);
    const adminFee = await categoryId(user, "Biaya Admin", "OUTCOME");
    await record(user, account.id, {
      type: "TRANSFER",
      amount: 500_000,
      admin_fee: 2500,
      to_account_id: other.id,
    });

    const { json } = await get(user, "/reports/outcome-by-category");

    expect(json.data).toEqual([
      { category_id: adminFee, name: "Biaya Admin", total: 2500, percent: 100 },
    ]);
  });

  it("leaves out income, the trash, other months, and other users", async () => {
    const user = await newUser();
    const other = await newUser();
    const account = await createAccount(user);
    const otherAccount = await createAccount(other);
    const food = await categoryId(user, "Makanan", "OUTCOME");
    await record(user, account.id, { amount: 1000, category_id: food });
    await record(user, account.id, { type: "INCOME", amount: 99_000 });
    const trashed = await record(user, account.id, { amount: 5000, category_id: food });
    await call("DELETE", `/transactions/${trashed.id}`, user);
    await record(user, account.id, { amount: 7000, category_id: food, date: `${monthsAgo(1)}-15T05:00:00Z` });
    await record(other, otherAccount.id, { amount: 8000 });

    const { json } = await get(user, "/reports/outcome-by-category");

    expect(json.data).toEqual([{ category_id: food, name: "Makanan", total: 1000, percent: 100 }]);
  });

  it("defaults to the current month and accepts a date range in the user's timezone", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const food = await categoryId(user, "Makanan", "OUTCOME");
    await record(user, account.id, { amount: 1000, category_id: food });
    await record(user, account.id, { amount: 7000, category_id: food, date: "2026-02-10T05:00:00Z" });
    await record(user, account.id, { amount: 3000, category_id: food, date: "2026-02-28T16:30:00Z" });
    await record(user, account.id, { amount: 5000, category_id: food, date: "2026-02-28T17:30:00Z" });

    const february = await get(user, "/reports/outcome-by-category?from=2026-02-01&to=2026-02-28");
    expect(february.json.data[0].total).toBe(10_000);

    const march = await get(user, "/reports/outcome-by-category?from=2026-03-01&to=2026-03-01");
    expect(march.json.data[0].total).toBe(5000);

    const january = await get(user, "/reports/outcome-by-category?from=2026-01-01&to=2026-01-31");
    expect(january.json.data).toEqual([]);

    const fromOnly = await get(user, "/reports/outcome-by-category?from=2026-02-11");
    expect(fromOnly.json.data[0].total).toBe(9000);

    const toOnly = await get(user, "/reports/outcome-by-category?to=2026-02-10");
    expect(toOnly.json.data[0].total).toBe(7000);

    const instants = await get(user, "/reports/outcome-by-category?from=2026-02-10T00:00:00Z&to=2026-02-10T23:59:59Z");
    expect(instants.json.data[0].total).toBe(7000);

    const current = await get(user, "/reports/outcome-by-category");
    expect(current.json.data[0].total).toBe(1000);
  });

  it("a user with no outcome gets an empty list", async () => {
    const user = await newUser();

    const { status, json } = await get(user, "/reports/outcome-by-category");

    expect(status).toBe(200);
    expect(json.data).toEqual([]);
  });

  it("400 for a bad range or unknown parameters, 401 without a token", async () => {
    const user = await newUser();

    for (const query of [
      "from=yesterday",
      "from=2026-13-01",
      "to=2026-11-13T03:20:00",
      "from=2026-11-10&to=2026-11-09",
      "page=2",
    ]) {
      expect((await get(user, `/reports/outcome-by-category?${query}`)).status).toBe(400);
    }
    expect((await call("GET", "/reports/outcome-by-category", undefined)).status).toBe(401);
  });
});

describe("GET /reports/monthly-trend", () => {
  it("returns the last six months by default, oldest first, with zeros for quiet months", async () => {
    const user = await newUser();

    const { status, json } = await get(user, "/reports/monthly-trend");

    expect(status).toBe(200);
    expect(json.data).toHaveLength(6);
    expect(json.data.map((row: any) => row.month)).toEqual([
      monthsAgo(5), monthsAgo(4), monthsAgo(3), monthsAgo(2), monthsAgo(1), month,
    ]);
    expect(json.data.every((row: any) => row.income === 0 && row.outcome === 0)).toBe(true);
  });

  it("sums income and outcome per month and leaves out transfers and the trash", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const other = await createAccount(user);
    await record(user, account.id, { type: "INCOME", amount: 8_000_000 });
    await record(user, account.id, { amount: 4_200_000 });
    await record(user, account.id, { type: "TRANSFER", amount: 999_000, to_account_id: other.id });
    await record(user, account.id, { type: "INCOME", amount: 5_000_000, date: `${monthsAgo(2)}-10T05:00:00Z` });
    await record(user, account.id, { amount: 1_500_000, date: `${monthsAgo(2)}-20T05:00:00Z` });
    const trashed = await record(user, account.id, { amount: 777_000, date: `${monthsAgo(1)}-12T05:00:00Z` });
    await call("DELETE", `/transactions/${trashed.id}`, user);

    const { json } = await get(user, "/reports/monthly-trend");
    const byMonth = Object.fromEntries(json.data.map((row: any) => [row.month, row]));

    expect(byMonth[month]).toEqual({ month, income: 8_000_000, outcome: 4_200_000 });
    expect(byMonth[monthsAgo(2)]).toEqual({ month: monthsAgo(2), income: 5_000_000, outcome: 1_500_000 });
    expect(byMonth[monthsAgo(1)]).toEqual({ month: monthsAgo(1), income: 0, outcome: 0 });
  });

  it("counts a transfer's admin fee as outcome", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const other = await createAccount(user);
    await record(user, account.id, { type: "TRANSFER", amount: 100_000, admin_fee: 2500, to_account_id: other.id });

    const { json } = await get(user, "/reports/monthly-trend?months=1");

    expect(json.data).toEqual([{ month, income: 0, outcome: 2500 }]);
  });

  it("months picks how far back to go, from 1 to 24", async () => {
    const user = await newUser();

    const one = await get(user, "/reports/monthly-trend?months=1");
    expect(one.json.data.map((row: any) => row.month)).toEqual([month]);

    const max = await get(user, "/reports/monthly-trend?months=24");
    expect(max.json.data).toHaveLength(24);
    expect(max.json.data[0].month).toBe(monthsAgo(23));
    expect(max.json.data[23].month).toBe(month);
  });

  it("decides month boundaries in the user's timezone", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const justBefore = new Date(new Date(monthStart).getTime() - 1000).toISOString();
    await record(user, account.id, { amount: 1000, date: monthStart });
    await record(user, account.id, { amount: 20_000, date: justBefore });

    const { json } = await get(user, "/reports/monthly-trend?months=2");

    expect(json.data).toEqual([
      { month: monthsAgo(1), income: 0, outcome: 20_000 },
      { month, income: 0, outcome: 1000 },
    ]);
  });

  it("400 for an invalid months value or unknown parameters, 401 without a token", async () => {
    const user = await newUser();

    for (const query of ["months=0", "months=25", "months=abc", "months=1.5", "months=-3", "range=6"]) {
      expect((await get(user, `/reports/monthly-trend?${query}`)).status).toBe(400);
    }
    expect((await call("GET", "/reports/monthly-trend", undefined)).status).toBe(401);
  });

  it("only the caller's data is counted", async () => {
    const owner = await newUser();
    const other = await newUser();
    const account = await createAccount(owner);
    await record(owner, account.id, { amount: 5000 });

    const { json } = await get(other, "/reports/monthly-trend?months=1");

    expect(json.data).toEqual([{ month, income: 0, outcome: 0 }]);
  });
});

describe("GET /reports/account-flow", () => {
  it("reports income, outcome and transfers per account", async () => {
    const user = await newUser();
    const first = await createAccount(user, { name: "First" });
    const second = await createAccount(user, { name: "Second" });
    const quiet = await createAccount(user, { name: "Quiet" });
    await record(user, first.id, { type: "INCOME", amount: 100_000 });
    await record(user, first.id, { amount: 30_000 });
    await record(user, first.id, { type: "TRANSFER", amount: 20_000, admin_fee: 500, to_account_id: second.id });
    await record(user, second.id, { type: "INCOME", amount: 4000 });

    const { status, json } = await get(user, "/reports/account-flow");

    expect(status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data).toEqual([
      { account_id: first.id, name: "First", income: 100_000, outcome: 30_500, transfer_in: 0, transfer_out: 20_000 },
      { account_id: second.id, name: "Second", income: 4000, outcome: 0, transfer_in: 20_000, transfer_out: 0 },
      { account_id: quiet.id, name: "Quiet", income: 0, outcome: 0, transfer_in: 0, transfer_out: 0 },
    ]);
  });

  it("leaves out the trash and counts only the requested range", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    await record(user, account.id, { amount: 1000 });
    await record(user, account.id, { amount: 7000, date: "2026-10-10T05:00:00Z" });
    const trashed = await record(user, account.id, { amount: 5000, date: "2026-10-11T05:00:00Z" });
    await call("DELETE", `/transactions/${trashed.id}`, user);

    const october = await get(user, "/reports/account-flow?from=2026-10-01&to=2026-10-31");
    expect(october.json.data[0]).toMatchObject({ outcome: 7000 });

    const current = await get(user, "/reports/account-flow");
    expect(current.json.data[0]).toMatchObject({ outcome: 1000 });
  });

  it("an archived account appears only when it had activity in the range", async () => {
    const user = await newUser();
    const used = await createAccount(user, { name: "Used" });
    const unused = await createAccount(user, { name: "Unused" });
    await record(user, used.id, { amount: 2000 });
    await call("POST", `/accounts/${used.id}/archive`, user);
    await call("POST", `/accounts/${unused.id}/archive`, user);

    const current = await get(user, "/reports/account-flow");
    expect(current.json.data.map((row: any) => row.account_id)).toEqual([used.id]);

    const past = await get(user, "/reports/account-flow?from=2026-01-01&to=2026-01-31");
    expect(past.json.data).toEqual([]);
  });

  it("account_id narrows the report to one account, and a transfer still shows on both sides", async () => {
    const user = await newUser();
    const first = await createAccount(user);
    const second = await createAccount(user);
    await record(user, first.id, { type: "TRANSFER", amount: 20_000, to_account_id: second.id });

    const { json } = await get(user, `/reports/account-flow?account_id=${second.id}`);

    expect(json.data).toEqual([
      { account_id: second.id, name: expect.any(String), income: 0, outcome: 0, transfer_in: 20_000, transfer_out: 0 },
    ]);
  });

  it("404 for another user's or an unknown account, 400 for a bad range, 401 without a token", async () => {
    const owner = await newUser();
    const intruder = await newUser();
    const account = await createAccount(owner);

    const foreign = await call("GET", `/reports/account-flow?account_id=${account.id}`, intruder);
    const unknown = await call("GET", "/reports/account-flow?account_id=ACC999999", intruder);

    expect(foreign.status).toBe(404);
    expect(await foreign.json()).toEqual(await unknown.json());
    expect((await get(owner, "/reports/account-flow?from=2026-11-10&to=2026-11-09")).status).toBe(400);
    expect((await get(owner, "/reports/account-flow?page=2")).status).toBe(400);
    expect((await call("GET", "/reports/account-flow", undefined)).status).toBe(401);
  });

  it("never shows another user's accounts", async () => {
    const owner = await newUser();
    const other = await newUser();
    const account = await createAccount(owner);
    await record(owner, account.id, { amount: 1000 });

    const { json } = await get(other, "/reports/account-flow");

    expect(json.data).toEqual([]);
  });
});
