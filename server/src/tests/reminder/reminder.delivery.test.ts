import { afterAll, afterEach, beforeAll, describe, expect, it } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { deviceTokens } from "../../db/schema/device.tokens.js";
import { users } from "../../db/schema/users.js";
import { deliverReminders } from "../../services/reminder/reminder.delivery.service.js";
import { fakeDelivery } from "../delivery.fake.js";
import {
  createUser,
  dayInJakarta,
  deleteUsers,
  insertOneTimePlan,
  insertRecurringPlan,
  insertReminder,
  reminderRow,
  startServer,
} from "../helpers.js";

const server = startServer();
const emails: string[] = [];

const newUser = async (prefs: Partial<typeof users.$inferInsert> = {}) => {
  const user = await createUser(server);
  emails.push(user.email);
  if (Object.keys(prefs).length > 0) {
    await db.update(users).set(prefs).where(eq(users.id, user.userId));
  }
  return user;
};

type User = Awaited<ReturnType<typeof newUser>>;

const addDevice = (user: User, token = `tok-${crypto.randomUUID()}`) =>
  db.insert(deviceTokens).values({ userId: user.userId, token, platform: "ANDROID" }).then(() => token);

const createAccountId = async (user: User) => {
  const res = await server.request({
    method: "POST",
    path: "/accounts",
    body: { name: "Main", type: "BANK", initial_balance: 500_000 },
    headers: { authorization: `Bearer ${user.accessToken}` },
  });
  return (await res.json()).data.id as string;
};

beforeAll(() => fakeDelivery.install());
afterEach(() => fakeDelivery.reset());
afterAll(async () => {
  fakeDelivery.restore();
  await deleteUsers(emails);
});

describe("deliverReminders", () => {
  it("sends one grouped push per user for several due reminders", async () => {
    const user = await newUser();
    await addDevice(user);
    const first = await insertOneTimePlan({ userId: user.userId, date: dayInJakarta(1), name: "Visa" });
    const second = await insertOneTimePlan({ userId: user.userId, date: dayInJakarta(2), name: "Flight" });
    const a = await insertReminder({ userId: user.userId, oneTimePlanId: first, dueDate: dayInJakarta(1) });
    const b = await insertReminder({ userId: user.userId, oneTimePlanId: second, dueDate: dayInJakarta(2) });

    const summary = await deliverReminders();
    expect(summary.sent).toBeGreaterThanOrEqual(2);

    const calls = fakeDelivery.pushCalls.filter((call) => call.message.data.reminder_ids.includes(a));
    expect(calls).toHaveLength(1);
    expect(calls[0]!.message.data.reminder_ids.split(",").sort()).toEqual([a, b].sort());
    expect(calls[0]!.message.data.deep_link).toBe("financare://action-needed");
    expect((await reminderRow(a)).status).toBe("SENT");
    expect((await reminderRow(b)).sentAt).not.toBeNull();
  });

  it("does not pick up reminders scheduled in the future", async () => {
    const user = await newUser();
    await addDevice(user);
    const plan = await insertOneTimePlan({ userId: user.userId, date: dayInJakarta(3) });
    const id = await insertReminder({
      userId: user.userId,
      oneTimePlanId: plan,
      dueDate: dayInJakarta(3),
      scheduledAt: new Date(Date.now() + 3600_000),
    });
    await deliverReminders();
    expect((await reminderRow(id)).status).toBe("SCHEDULED");
  });

  it("is idempotent: a second run does not resend", async () => {
    const user = await newUser();
    await addDevice(user);
    const plan = await insertOneTimePlan({ userId: user.userId, date: dayInJakarta(1) });
    const id = await insertReminder({ userId: user.userId, oneTimePlanId: plan, dueDate: dayInJakarta(1) });
    await deliverReminders();
    await deliverReminders();
    const calls = fakeDelivery.pushCalls.filter((call) => call.message.data.reminder_ids.includes(id));
    expect(calls).toHaveLength(1);
  });

  it("defers reminders during quiet hours", async () => {
    const user = await newUser({ quietHoursStart: "00:00", quietHoursEnd: "23:59" });
    await addDevice(user);
    const plan = await insertOneTimePlan({ userId: user.userId, date: dayInJakarta(1) });
    const id = await insertReminder({ userId: user.userId, oneTimePlanId: plan, dueDate: dayInJakarta(1) });
    await deliverReminders();
    const row = await reminderRow(id);
    expect(row.status).toBe("SCHEDULED");
    expect(row.sentAt).toBeNull();
    expect(fakeDelivery.pushCalls.filter((c) => c.message.data.reminder_ids.includes(id))).toHaveLength(0);
  });

  it("falls back to email when push is disabled and fallback is on", async () => {
    const user = await newUser({ pushEnabled: false, emailFallback: true });
    await addDevice(user);
    const plan = await insertOneTimePlan({ userId: user.userId, date: dayInJakarta(1), name: "Visa" });
    const id = await insertReminder({ userId: user.userId, oneTimePlanId: plan, dueDate: dayInJakarta(1) });
    await deliverReminders();
    const row = await reminderRow(id);
    expect(row.status).toBe("SENT");
    expect(row.channel).toBe("EMAIL");
    expect(fakeDelivery.mails.some((mail) => mail.to === user.email && mail.text.includes("Visa"))).toBe(true);
  });

  it("falls back to email when the user has no device", async () => {
    const user = await newUser({ emailFallback: true });
    const plan = await insertOneTimePlan({ userId: user.userId, date: dayInJakarta(1) });
    const id = await insertReminder({ userId: user.userId, oneTimePlanId: plan, dueDate: dayInJakarta(1) });
    await deliverReminders();
    expect((await reminderRow(id)).channel).toBe("EMAIL");
  });

  it("skips the reminder when there is no way to deliver it", async () => {
    const user = await newUser({ emailFallback: false });
    const plan = await insertOneTimePlan({ userId: user.userId, date: dayInJakarta(1) });
    const id = await insertReminder({ userId: user.userId, oneTimePlanId: plan, dueDate: dayInJakarta(1) });
    await deliverReminders();
    expect((await reminderRow(id)).status).toBe("SKIPPED");
  });

  it("deletes tokens rejected as invalid and falls back to email", async () => {
    const user = await newUser({ emailFallback: true });
    const token = await addDevice(user);
    fakeDelivery.pushOutcome = (devices) => devices.map((d) => ({ token: d.token, result: "invalid" }));
    const plan = await insertOneTimePlan({ userId: user.userId, date: dayInJakarta(1) });
    const id = await insertReminder({ userId: user.userId, oneTimePlanId: plan, dueDate: dayInJakarta(1) });
    await deliverReminders();
    const remaining = await db.select().from(deviceTokens).where(eq(deviceTokens.token, token));
    expect(remaining).toHaveLength(0);
    expect((await reminderRow(id)).channel).toBe("EMAIL");
  });

  it("retries with backoff after a transient push failure", async () => {
    const user = await newUser();
    await addDevice(user);
    fakeDelivery.pushOutcome = (devices) => devices.map((d) => ({ token: d.token, result: "error" }));
    const plan = await insertOneTimePlan({ userId: user.userId, date: dayInJakarta(1) });
    const id = await insertReminder({ userId: user.userId, oneTimePlanId: plan, dueDate: dayInJakarta(1) });
    await deliverReminders();
    const row = await reminderRow(id);
    expect(row.attempts).toBe(1);
    expect(row.status).toBe("SCHEDULED");
    expect(row.scheduledAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("marks the reminder failed after the fifth failed attempt", async () => {
    const user = await newUser();
    await addDevice(user);
    fakeDelivery.pushOutcome = (devices) => devices.map((d) => ({ token: d.token, result: "error" }));
    const plan = await insertOneTimePlan({ userId: user.userId, date: dayInJakarta(1) });
    const id = await insertReminder({ userId: user.userId, oneTimePlanId: plan, dueDate: dayInJakarta(1), attempts: 4 });
    await deliverReminders();
    const row = await reminderRow(id);
    expect(row.attempts).toBe(5);
    expect(row.status).toBe("FAILED");
  });

  it("skips reminders whose plan is no longer active", async () => {
    const user = await newUser();
    await addDevice(user);
    const plan = await insertOneTimePlan({ userId: user.userId, date: dayInJakarta(1), status: "CANCELLED" });
    const id = await insertReminder({ userId: user.userId, oneTimePlanId: plan, dueDate: dayInJakarta(1) });
    await deliverReminders();
    expect((await reminderRow(id)).status).toBe("SKIPPED");
    expect(fakeDelivery.pushCalls).toHaveLength(0);
  });

  it("skips recurring reminders whose due date has moved on", async () => {
    const user = await newUser();
    await addDevice(user);
    const accountId = await createAccountId(user);
    const plan = await insertRecurringPlan({ userId: user.userId, accountId, nextDueDate: dayInJakarta(30) });
    const id = await insertReminder({ userId: user.userId, recurringPlanId: plan, dueDate: dayInJakarta(1) });
    await deliverReminders();
    expect((await reminderRow(id)).status).toBe("SKIPPED");
  });

  it("describes recurring reminders with the amount", async () => {
    const user = await newUser();
    await addDevice(user);
    const accountId = await createAccountId(user);
    const plan = await insertRecurringPlan({ userId: user.userId, accountId, name: "Rent", amount: 1_500_000, nextDueDate: dayInJakarta(1) });
    const id = await insertReminder({ userId: user.userId, recurringPlanId: plan, dueDate: dayInJakarta(1) });
    await deliverReminders();
    const call = fakeDelivery.pushCalls.find((c) => c.message.data.reminder_ids.includes(id))!;
    expect(call.message.body).toContain("Rent");
    expect(call.message.body).toContain("Rp1.500.000");
  });

  it("hides balance figures when hide_balance is on", async () => {
    const visible = await newUser();
    const hidden = await newUser({ hideBalance: true });
    const ids: string[] = [];
    for (const user of [visible, hidden]) {
      await addDevice(user);
      const accountId = await createAccountId(user);
      const plan = await insertOneTimePlan({ userId: user.userId, date: dayInJakarta(2), sourceAccountId: accountId, targetAmount: 900_000 });
      ids.push(await insertReminder({ userId: user.userId, oneTimePlanId: plan, dueDate: dayInJakarta(2) }));
    }
    await deliverReminders();
    const bodyOf = (id: string) => fakeDelivery.pushCalls.find((c) => c.message.data.reminder_ids.includes(id))!.message.body;
    expect(bodyOf(ids[0]!)).toContain("Rp");
    expect(bodyOf(ids[1]!)).not.toContain("Rp");
  });

  it("does not deliver to users scheduled for deletion", async () => {
    const user = await newUser({ deletedAt: new Date() });
    await addDevice(user);
    const plan = await insertOneTimePlan({ userId: user.userId, date: dayInJakarta(1) });
    const id = await insertReminder({ userId: user.userId, oneTimePlanId: plan, dueDate: dayInJakarta(1) });
    await deliverReminders();
    expect((await reminderRow(id)).status).toBe("SCHEDULED");
  });
});
