import { afterAll, describe, expect, it } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { users } from "../../db/schema/users.js";
import {
  createUser,
  dayInJakarta,
  deleteUsers,
  insertOneTimePlan,
  insertRecurringPlan,
  insertReminder,
  reminderRow,
  remindersOfPlan,
  startServer,
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

const createAccount = async (user: User) => {
  const res = await call("POST", "/accounts", user, {
    name: "Main",
    type: "BANK",
    initial_balance: 1_000_000,
  });
  return (await res.json()).data.id as string;
};

afterAll(async () => {
  await deleteUsers(emails);
});

describe("reminder scheduling", () => {
  it("creates one reminder per offset when a recurring plan is created", async () => {
    const user = await newUser();
    const accountId = await createAccount(user);
    const res = await call("POST", "/recurring-plans", user, {
      name: "Rent",
      type: "OUTCOME",
      amount: 5000,
      account_id: accountId,
      frequency: "MONTHLY",
      start_date: dayInJakarta(20),
      reminder_offsets: [0, 3],
    });
    expect(res.status).toBe(201);
    const planId = (await res.json()).data.id as string;

    const rows = await remindersOfPlan({ recurringPlanId: planId });
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.status === "SCHEDULED")).toBe(true);
    expect(rows.every((row) => row.dueDate === dayInJakarta(20))).toBe(true);
  });

  it("schedules at the notification time in the user timezone", async () => {
    const user = await newUser();
    const accountId = await createAccount(user);
    const planId = await insertRecurringPlan({
      userId: user.userId,
      accountId,
      nextDueDate: dayInJakarta(10),
    });
    await call("PATCH", `/recurring-plans/${planId}`, user, { name: "Renamed" });

    const [row] = await remindersOfPlan({ recurringPlanId: planId });
    expect(row).toBeDefined();
    const local = new Date(row!.scheduledAt.getTime() + 7 * 3600_000)
      .toISOString()
      .slice(11, 16);
    expect(local).toBe("08:00");
  });

  it("does not schedule reminders in the past", async () => {
    const user = await newUser();
    const accountId = await createAccount(user);
    const planId = await insertRecurringPlan({
      userId: user.userId,
      accountId,
      nextDueDate: dayInJakarta(-3),
    });
    await call("PATCH", `/recurring-plans/${planId}`, user, { name: "Renamed" });
    expect(await remindersOfPlan({ recurringPlanId: planId })).toHaveLength(0);
  });

  it("removes unsent reminders when a plan is paused and restores them on resume", async () => {
    const user = await newUser();
    const accountId = await createAccount(user);
    const res = await call("POST", "/recurring-plans", user, {
      name: "Gym",
      type: "OUTCOME",
      amount: 5000,
      account_id: accountId,
      frequency: "MONTHLY",
      start_date: dayInJakarta(15),
      reminder_offsets: [1],
    });
    const planId = (await res.json()).data.id as string;
    expect(await remindersOfPlan({ recurringPlanId: planId })).toHaveLength(1);

    await call("POST", `/recurring-plans/${planId}/pause`, user);
    expect(await remindersOfPlan({ recurringPlanId: planId })).toHaveLength(0);

    await call("POST", `/recurring-plans/${planId}/resume`, user);
    expect(await remindersOfPlan({ recurringPlanId: planId })).toHaveLength(1);
  });

  it("creates reminders for one-time plans and removes them on cancel", async () => {
    const user = await newUser();
    const res = await call("POST", "/one-time-plans", user, {
      name: "Trip",
      date: dayInJakarta(12),
      target_amount: 100000,
      reminder_offsets: [1, 7],
    });
    expect(res.status).toBe(201);
    const planId = (await res.json()).data.id as string;
    expect(await remindersOfPlan({ oneTimePlanId: planId })).toHaveLength(2);

    await call("POST", `/one-time-plans/${planId}/cancel`, user);
    expect(await remindersOfPlan({ oneTimePlanId: planId })).toHaveLength(0);
  });

  it("reschedules reminders when the notification time changes", async () => {
    const user = await newUser();
    const planId = await insertOneTimePlan({
      userId: user.userId,
      date: dayInJakarta(10),
      reminderOffsets: [1],
    });
    await call("PATCH", `/one-time-plans/${planId}`, user, { name: "Edited" });
    const before = (await remindersOfPlan({ oneTimePlanId: planId }))[0]!;

    await db.update(users).set({ timezone: "Asia/Makassar" }).where(eq(users.id, user.userId));
    await call("PATCH", "/me/notification-preferences", user, { send_time: "09:30" });

    const after = (await remindersOfPlan({ oneTimePlanId: planId }))[0]!;
    expect(after.scheduledAt.getTime()).not.toBe(before.scheduledAt.getTime());
    const local = new Date(after.scheduledAt.getTime() + 8 * 3600_000)
      .toISOString()
      .slice(11, 16);
    expect(local).toBe("09:30");
  });
});

describe("GET /reminders", () => {
  it("requires authentication", async () => {
    expect((await call("GET", "/reminders", undefined)).status).toBe(401);
  });

  it("lists only the caller's reminders with the documented shape", async () => {
    const user = await newUser();
    const other = await newUser();
    const planId = await insertOneTimePlan({ userId: user.userId, date: dayInJakarta(5), name: "Visa" });
    const otherPlan = await insertOneTimePlan({ userId: other.userId, date: dayInJakarta(5) });
    const mine = await insertReminder({ userId: user.userId, oneTimePlanId: planId, dueDate: dayInJakarta(5) });
    await insertReminder({ userId: other.userId, oneTimePlanId: otherPlan, dueDate: dayInJakarta(5) });

    const res = await call("GET", "/reminders", user);
    expect(res.status).toBe(200);
    const list = (await res.json()).data as Record<string, any>[];
    expect(list.some((item) => item.id === mine)).toBe(true);
    const item = list.find((entry) => entry.id === mine)!;
    expect(item).toMatchObject({
      plan_type: "ONE_TIME",
      plan_id: planId,
      name: "Visa",
      channel: "PUSH",
      status: "SCHEDULED",
      sent_at: null,
    });
    expect(list.every((entry) => entry.plan_id !== otherPlan)).toBe(true);
  });

  it("filters pending reminders to those already sent or snoozed", async () => {
    const user = await newUser();
    const planId = await insertOneTimePlan({ userId: user.userId, date: dayInJakarta(5) });
    const sent = await insertReminder({ userId: user.userId, oneTimePlanId: planId, dueDate: dayInJakarta(5), status: "SENT" });
    const acted = await insertReminder({ userId: user.userId, oneTimePlanId: planId, dueDate: dayInJakarta(5), status: "ACTED" });
    const scheduled = await insertReminder({ userId: user.userId, oneTimePlanId: planId, dueDate: dayInJakarta(5) });

    const list = (await (await call("GET", "/reminders?status=pending", user)).json()).data as Record<string, any>[];
    const ids = list.map((item) => item.id);
    expect(ids).toContain(sent);
    expect(ids).not.toContain(acted);
    expect(ids).not.toContain(scheduled);
  });

  it("rejects an unknown status", async () => {
    const user = await newUser();
    expect((await call("GET", "/reminders?status=bogus", user)).status).toBe(400);
  });
});

describe("POST /reminders/:id/snooze", () => {
  const setup = async (status: "SENT" | "ACTED" | "SKIPPED" | "FAILED" = "SENT") => {
    const user = await newUser();
    const planId = await insertOneTimePlan({ userId: user.userId, date: dayInJakarta(5) });
    const id = await insertReminder({ userId: user.userId, oneTimePlanId: planId, dueDate: dayInJakarta(5), status, attempts: 2 });
    return { user, id };
  };

  it("snoozes and reschedules the reminder", async () => {
    const { user, id } = await setup();
    const res = await call("POST", `/reminders/${id}/snooze`, user, { minutes: 60 });
    expect(res.status).toBe(200);
    const data = (await res.json()).data;
    expect(data.status).toBe("SNOOZED");
    const row = await reminderRow(id);
    expect(row.sentAt).toBeNull();
    expect(row.attempts).toBe(0);
    const delta = row.scheduledAt.getTime() - Date.now();
    expect(delta).toBeGreaterThan(59 * 60_000);
    expect(delta).toBeLessThan(61 * 60_000);
  });

  it("rejects minutes outside 15 to 1440", async () => {
    const { user, id } = await setup();
    expect((await call("POST", `/reminders/${id}/snooze`, user, { minutes: 14 })).status).toBe(400);
    expect((await call("POST", `/reminders/${id}/snooze`, user, { minutes: 1441 })).status).toBe(400);
    expect((await call("POST", `/reminders/${id}/snooze`, user, {})).status).toBe(400);
  });

  it("refuses to snooze a reminder that is already handled", async () => {
    for (const status of ["ACTED", "SKIPPED", "FAILED"] as const) {
      const { user, id } = await setup(status);
      const res = await call("POST", `/reminders/${id}/snooze`, user, { minutes: 30 });
      expect(res.status).toBe(422);
    }
  });

  it("returns 404 for another user's or unknown reminder", async () => {
    const { id } = await setup();
    const stranger = await newUser();
    expect((await call("POST", `/reminders/${id}/snooze`, stranger, { minutes: 30 })).status).toBe(404);
    expect((await call("POST", "/reminders/RMD999999/snooze", stranger, { minutes: 30 })).status).toBe(404);
  });
});
