export type NotificationItem =
  | {
      kind: "RECURRING";
      name: string;
      amount: number;
      daysUntil: number;
      autoRecord: boolean;
    }
  | {
      kind: "ONE_TIME";
      name: string;
      target: number;
      daysUntil: number;
      funding: { available: number; shortfall: number; sufficient: boolean };
    }
  | { kind: "MISSED"; name: string };

export const money = (value: number) =>
  `Rp${Math.round(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;

const when = (daysUntil: number) => {
  if (daysUntil === 0) return "hari ini";
  if (daysUntil === 1) return "besok";
  if (daysUntil > 1) return `dalam ${daysUntil} hari`;
  return `${-daysUntil} hari yang lalu`;
};

export const describeItem = (item: NotificationItem, hideBalance: boolean) => {
  switch (item.kind) {
    case "RECURRING":
      return item.autoRecord
        ? `${item.name} ${money(item.amount)} akan dicatat otomatis ${when(item.daysUntil)}.`
        : `${item.name} ${money(item.amount)} jatuh tempo ${when(item.daysUntil)}.`;
    case "ONE_TIME": {
      if (hideBalance) {
        return item.funding.sufficient
          ? `Dana untuk ${item.name} sudah cukup (${when(item.daysUntil)}).`
          : `Dana untuk ${item.name} belum cukup (${when(item.daysUntil)}).`;
      }
      const status = item.funding.sufficient
        ? "cukup"
        : `kurang ${money(item.funding.shortfall)}`;
      return `Siapkan ${money(item.target)} untuk ${item.name} (${when(item.daysUntil)}). Saldo Anda ${money(item.funding.available)}, ${status}.`;
    }
    case "MISSED":
      return `${item.name} terlewat. Jadwalkan ulang atau batalkan.`;
  }
};

export const buildNotification = (
  items: NotificationItem[],
  hideBalance: boolean,
  reminderIds: string[],
) => {
  const data = {
    type: "reminders",
    reminder_ids: reminderIds.join(","),
    deep_link: "financare://action-needed",
  };

  if (items.length === 1) {
    return {
      title: "Pengingat Financare",
      body: describeItem(items[0]!, hideBalance),
      data,
    };
  }

  const names = items.slice(0, 3).map((item) => item.name);
  const rest = items.length - names.length;
  return {
    title: "Pengingat Financare",
    body: `Ada ${items.length} hal yang perlu diperhatikan: ${names.join(", ")}${rest > 0 ? `, dan ${rest} lainnya` : ""}.`,
    data,
  };
};

export const inQuietHours = (
  now: string,
  start: string | null,
  end: string | null,
) => {
  if (!start || !end) return false;
  return start < end ? now >= start && now < end : now >= start || now < end;
};

export const daysBetween = (from: string, to: string) =>
  Math.round(
    (Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10)) -
      Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10))) /
      86_400_000,
  );
