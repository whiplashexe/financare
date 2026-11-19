import { describe, expect, it } from "bun:test";
import {
  addDays,
  dueDateAt,
  nextDueAfter,
  nextDueOnOrAfter,
} from "../../utils/recurrence.util.js";

const sequence = (start: string, frequency: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY", count: number) =>
  Array.from({ length: count }, (_, i) => dueDateAt(start, frequency, i));

describe("addDays", () => {
  it("moves across month, year, and leap-day boundaries", () => {
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2027-02-28", 1)).toBe("2027-03-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("dueDateAt", () => {
  it("daily and weekly", () => {
    expect(sequence("2026-12-30", "DAILY", 4)).toEqual([
      "2026-12-30",
      "2026-12-31",
      "2027-01-01",
      "2027-01-02",
    ]);
    expect(sequence("2026-11-13", "WEEKLY", 3)).toEqual([
      "2026-11-13",
      "2026-11-20",
      "2026-11-27",
    ]);
  });

  it("monthly keeps the day, and rolls over the year", () => {
    expect(sequence("2026-11-15", "MONTHLY", 4)).toEqual([
      "2026-11-15",
      "2026-12-15",
      "2027-01-15",
      "2027-02-15",
    ]);
  });

  it("monthly on the 31st falls on the last day of shorter months and returns to the 31st", () => {
    expect(sequence("2027-01-31", "MONTHLY", 6)).toEqual([
      "2027-01-31",
      "2027-02-28",
      "2027-03-31",
      "2027-04-30",
      "2027-05-31",
      "2027-06-30",
    ]);
  });

  it("monthly on the 29th and 30th use the leap day only in leap years", () => {
    expect(sequence("2027-12-29", "MONTHLY", 3)).toEqual([
      "2027-12-29",
      "2028-01-29",
      "2028-02-29",
    ]);
    expect(dueDateAt("2026-12-29", "MONTHLY", 2)).toBe("2027-02-28");
    expect(dueDateAt("2026-12-30", "MONTHLY", 2)).toBe("2027-02-28");
  });

  it("yearly keeps the date, and a leap day falls on Feb 28 in other years", () => {
    expect(sequence("2026-07-04", "YEARLY", 3)).toEqual([
      "2026-07-04",
      "2027-07-04",
      "2028-07-04",
    ]);
    expect(sequence("2028-02-29", "YEARLY", 5)).toEqual([
      "2028-02-29",
      "2029-02-28",
      "2030-02-28",
      "2031-02-28",
      "2032-02-29",
    ]);
  });

  it("the sequence never goes backwards", () => {
    for (const frequency of ["DAILY", "WEEKLY", "MONTHLY", "YEARLY"] as const) {
      const dates = sequence("2027-01-31", frequency, 40);
      expect([...dates].sort()).toEqual(dates);
      expect(new Set(dates).size).toBe(dates.length);
    }
  });
});

describe("nextDueAfter", () => {
  it("returns the first due date strictly after the given day", () => {
    expect(nextDueAfter("2026-11-13", "WEEKLY", "2026-11-13")).toBe("2026-11-20");
    expect(nextDueAfter("2026-11-13", "WEEKLY", "2026-11-19")).toBe("2026-11-20");
    expect(nextDueAfter("2026-11-13", "WEEKLY", "2026-11-20")).toBe("2026-11-27");
  });

  it("keeps the original day as the reference for monthly plans", () => {
    expect(nextDueAfter("2027-01-31", "MONTHLY", "2027-01-31")).toBe("2027-02-28");
    expect(nextDueAfter("2027-01-31", "MONTHLY", "2027-02-28")).toBe("2027-03-31");
  });

  it("works for a day before the start", () => {
    expect(nextDueAfter("2027-01-31", "MONTHLY", "2026-06-01")).toBe("2027-01-31");
  });
});

describe("nextDueOnOrAfter", () => {
  it("includes the given day when it is a due date", () => {
    expect(nextDueOnOrAfter("2026-11-13", "WEEKLY", "2026-11-20")).toBe("2026-11-20");
    expect(nextDueOnOrAfter("2026-11-13", "WEEKLY", "2026-11-21")).toBe("2026-11-27");
    expect(nextDueOnOrAfter("2026-11-13", "DAILY", "2026-11-13")).toBe("2026-11-13");
  });

  it("skips many missed periods without backfilling", () => {
    expect(nextDueOnOrAfter("2025-01-01", "DAILY", "2026-11-19")).toBe("2026-11-19");
    expect(nextDueOnOrAfter("2025-01-31", "MONTHLY", "2026-11-19")).toBe("2026-11-30");
  });
});
