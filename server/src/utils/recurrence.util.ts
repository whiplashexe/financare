export type Frequency = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";

const pad = (value: number) => String(value).padStart(2, "0");

const parts = (date: string) => {
  const [year, month, day] = date.split("-").map(Number);
  return { year: year!, month: month!, day: day! };
};

const format = (year: number, month: number, day: number) =>
  `${year}-${pad(month)}-${pad(day)}`;

const daysInMonth = (year: number, month: number) =>
  new Date(Date.UTC(year, month, 0)).getUTCDate();

export const addDays = (date: string, days: number) => {
  const { year, month, day } = parts(date);
  const moved = new Date(Date.UTC(year, month - 1, day + days));
  return format(
    moved.getUTCFullYear(),
    moved.getUTCMonth() + 1,
    moved.getUTCDate(),
  );
};

export const dueDateAt = (start: string, frequency: Frequency, index: number) => {
  const { year, month, day } = parts(start);

  switch (frequency) {
    case "DAILY":
      return addDays(start, index);
    case "WEEKLY":
      return addDays(start, index * 7);
    case "MONTHLY": {
      const total = year * 12 + (month - 1) + index;
      const targetYear = Math.floor(total / 12);
      const targetMonth = (total % 12) + 1;
      return format(
        targetYear,
        targetMonth,
        Math.min(day, daysInMonth(targetYear, targetMonth)),
      );
    }
    case "YEARLY": {
      const targetYear = year + index;
      return format(targetYear, month, Math.min(day, daysInMonth(targetYear, month)));
    }
  }
};

const MAX_STEPS = 200_000;

export const nextDueAfter = (start: string, frequency: Frequency, after: string) => {
  for (let index = 0; index < MAX_STEPS; index++) {
    const candidate = dueDateAt(start, frequency, index);
    if (candidate > after) return candidate;
  }
  throw new Error("recurrence did not converge");
};

export const nextDueOnOrAfter = (
  start: string,
  frequency: Frequency,
  onOrAfter: string,
) => {
  for (let index = 0; index < MAX_STEPS; index++) {
    const candidate = dueDateAt(start, frequency, index);
    if (candidate >= onOrAfter) return candidate;
  }
  throw new Error("recurrence did not converge");
};
