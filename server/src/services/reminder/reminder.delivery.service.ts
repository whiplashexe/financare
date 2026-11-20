import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { deviceTokens } from "../../db/schema/device.tokens.js";
import { oneTimePlans } from "../../db/schema/one.time.plans.js";
import { recurringPlans } from "../../db/schema/recurring.plans.js";
import { reminders } from "../../db/schema/reminders.js";
import { users } from "../../db/schema/users.js";
import { mailClient } from "../../lib/mailer.js";
import { pushClient } from "../../lib/push.js";
import { loadBalances } from "../../utils/account.util.js";
import {
  buildNotification,
  daysBetween,
  describeItem,
  inQuietHours,
  type NotificationItem,
} from "../../utils/notification.util.js";
import { toFunding } from "../../utils/onetime.util.js";

const BATCH = 500;
const LEASE_MINUTES = 10;
const MAX_ATTEMPTS = 5;

type Claimed = {
  id: string;
  userId: string;
  recurringPlanId: string | null;
  oneTimePlanId: string | null;
  dueDate: string;
};

const claim = async () => {
  const result = await db.execute<{ id: string }>(sql`
    update reminder set scheduled_at = now() + ${LEASE_MINUTES} * interval '1 minute'
    where id in (
      select r.id from reminder r
      join "user" u on u.id = r.user_id
      where r.status in ('SCHEDULED', 'SNOOZED')
        and r.sent_at is null
        and r.scheduled_at <= now()
        and u.deleted_at is null
      order by r.scheduled_at
      limit ${BATCH}
      for update of r skip locked
    )
    returning id
  `);

  const ids = result.rows.map((row) => row.id);
  if (ids.length === 0) return [];

  return db
    .select({
      id: reminders.id,
      userId: reminders.userId,
      recurringPlanId: reminders.recurringPlanId,
      oneTimePlanId: reminders.oneTimePlanId,
      dueDate: reminders.dueDate,
    })
    .from(reminders)
    .where(inArray(reminders.id, ids))
    .orderBy(asc(reminders.userId), asc(reminders.dueDate), asc(reminders.id));
};

const markSent = (ids: string[], channel: "PUSH" | "EMAIL") =>
  db
    .update(reminders)
    .set({
      status: "SENT",
      sentAt: sql`now()`,
      channel,
      attempts: sql`${reminders.attempts} + 1`,
    })
    .where(inArray(reminders.id, ids));

const markSkipped = (ids: string[]) =>
  db.update(reminders).set({ status: "SKIPPED" }).where(inArray(reminders.id, ids));

const markRetry = (ids: string[]) =>
  db
    .update(reminders)
    .set({
      attempts: sql`${reminders.attempts} + 1`,
      status: sql`case when ${reminders.attempts} + 1 >= ${MAX_ATTEMPTS} then 'FAILED'::reminder_status else ${reminders.status} end`,
      scheduledAt: sql`case when ${reminders.attempts} + 1 >= ${MAX_ATTEMPTS} then ${reminders.scheduledAt} else now() + power(2, ${reminders.attempts}) * interval '1 minute' end`,
    })
    .where(inArray(reminders.id, ids));

const release = (ids: string[]) =>
  db.update(reminders).set({ scheduledAt: sql`now()` }).where(inArray(reminders.id, ids));

export const deliverReminders = async () => {
  const claimed: Claimed[] = await claim();

  const summary = {
    considered: claimed.length,
    sent: 0,
    skipped: 0,
    deferred: 0,
    retrying: 0,
    failed: 0,
  };

  const byUser = new Map<string, Claimed[]>();
  for (const reminder of claimed) {
    byUser.set(reminder.userId, [...(byUser.get(reminder.userId) ?? []), reminder]);
  }

  for (const [userId, group] of byUser) {
    try {
      await deliverToUser(userId, group, summary);
    } catch {
      await markRetry(group.map((reminder) => reminder.id));
      summary.retrying += group.length;
    }
  }

  return summary;
};

const deliverToUser = async (
  userId: string,
  group: Claimed[],
  summary: Record<string, number>,
) => {
  const [user] = await db
    .select({
      email: users.email,
      pushEnabled: users.pushEnabled,
      emailFallback: users.emailFallback,
      hideBalance: users.hideBalance,
      quietStart: users.quietHoursStart,
      quietEnd: users.quietHoursEnd,
      localTime: sql<string>`(now() at time zone ${users.timezone})::time::text`,
      today: sql<string>`(now() at time zone ${users.timezone})::date::text`,
    })
    .from(users)
    .where(eq(users.id, userId));

  if (!user) return;

  if (inQuietHours(user.localTime, user.quietStart, user.quietEnd)) {
    await release(group.map((reminder) => reminder.id));
    summary.deferred = (summary.deferred ?? 0) + group.length;
    return;
  }

  const balances = group.some((reminder) => reminder.oneTimePlanId)
    ? await loadBalances(db, userId)
    : undefined;

  const live: { id: string; item: NotificationItem }[] = [];
  const stale: string[] = [];

  for (const reminder of group) {
    const item = await describeReminder(reminder, user.today, balances);
    if (item) live.push({ id: reminder.id, item });
    else stale.push(reminder.id);
  }

  if (stale.length > 0) {
    await markSkipped(stale);
    summary.skipped = (summary.skipped ?? 0) + stale.length;
  }
  if (live.length === 0) return;

  const ids = live.map((entry) => entry.id);
  const message = buildNotification(
    live.map((entry) => entry.item),
    user.hideBalance,
    ids,
  );

  const devices = user.pushEnabled
    ? await db
        .select({ token: deviceTokens.token, platform: deviceTokens.platform })
        .from(deviceTokens)
        .where(eq(deviceTokens.userId, userId))
    : [];

  if (devices.length > 0 && pushClient.isConfigured()) {
    const results = await pushClient.send(devices, message);

    const invalid = results.filter((r) => r.result === "invalid").map((r) => r.token);
    if (invalid.length > 0) {
      await db
        .delete(deviceTokens)
        .where(and(eq(deviceTokens.userId, userId), inArray(deviceTokens.token, invalid)));
    }

    if (results.some((r) => r.result === "ok")) {
      await markSent(ids, "PUSH");
      summary.sent = (summary.sent ?? 0) + ids.length;
    } else if (invalid.length === results.length && user.emailFallback && mailClient.isConfigured()) {
      await sendByEmail(user.email, live, user.hideBalance, ids, summary);
    } else {
      await markRetry(ids);
      summary.retrying = (summary.retrying ?? 0) + ids.length;
    }
    return;
  }

  if (user.emailFallback && mailClient.isConfigured()) {
    await sendByEmail(user.email, live, user.hideBalance, ids, summary);
    return;
  }

  await markSkipped(ids);
  summary.skipped = (summary.skipped ?? 0) + ids.length;
};

const sendByEmail = async (
  to: string,
  live: { id: string; item: NotificationItem }[],
  hideBalance: boolean,
  ids: string[],
  summary: Record<string, number>,
) => {
  try {
    await mailClient.send({
      to,
      subject: "Pengingat Financare",
      text: live.map((entry) => `- ${describeItem(entry.item, hideBalance)}`).join("\n"),
    });
    await markSent(ids, "EMAIL");
    summary.sent = (summary.sent ?? 0) + ids.length;
  } catch {
    await markRetry(ids);
    summary.retrying = (summary.retrying ?? 0) + ids.length;
  }
};

const describeReminder = async (
  reminder: Claimed,
  today: string,
  balances: Awaited<ReturnType<typeof loadBalances>> | undefined,
): Promise<NotificationItem | null> => {
  if (reminder.recurringPlanId) {
    const [plan] = await db
      .select({
        name: recurringPlans.name,
        amount: recurringPlans.amount,
        status: recurringPlans.status,
        nextDueDate: recurringPlans.nextDueDate,
        autoRecord: recurringPlans.autoRecord,
      })
      .from(recurringPlans)
      .where(eq(recurringPlans.id, reminder.recurringPlanId));

    if (!plan || plan.status !== "ACTIVE" || plan.nextDueDate !== reminder.dueDate) {
      return null;
    }
    return {
      kind: "RECURRING",
      name: plan.name,
      amount: plan.amount,
      daysUntil: daysBetween(today, reminder.dueDate),
      autoRecord: plan.autoRecord,
    };
  }

  const [plan] = await db
    .select({
      name: oneTimePlans.name,
      date: oneTimePlans.date,
      targetAmount: oneTimePlans.targetAmount,
      status: oneTimePlans.status,
      sourceAccountId: oneTimePlans.sourceAccountId,
    })
    .from(oneTimePlans)
    .where(eq(oneTimePlans.id, reminder.oneTimePlanId!));

  if (!plan) return null;
  if (plan.status === "MISSED" && plan.date === reminder.dueDate) {
    return { kind: "MISSED", name: plan.name };
  }
  if (plan.status !== "PLANNED") return null;

  const funding = toFunding(
    {
      id: reminder.oneTimePlanId!,
      userId: reminder.userId,
      sourceAccountId: plan.sourceAccountId,
      name: plan.name,
      date: plan.date,
      targetAmount: plan.targetAmount,
      location: null,
      note: null,
      reminderOffsets: [],
      status: plan.status,
    },
    balances ?? { byAccount: new Map(), total: 0 },
  )!;

  return {
    kind: "ONE_TIME",
    name: plan.name,
    target: plan.targetAmount,
    daysUntil: daysBetween(today, reminder.dueDate),
    funding,
  };
};
