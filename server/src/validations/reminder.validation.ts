import z from "zod";
import { id } from "./transaction.validation.js";

export class ReminderValidation {
  static LIST_QUERY = z
    .object({
      status: z
        .enum([
          "pending",
          "SCHEDULED",
          "SENT",
          "ACTED",
          "SNOOZED",
          "SKIPPED",
          "FAILED",
          "ALL",
        ])
        .default("ALL"),
    })
    .strict();

  static SNOOZE = z
    .object({ minutes: z.number().int().min(15).max(1440) })
    .strict();

  static PARAMS = z.object({ id });
}

export type ListRemindersQuery = z.infer<typeof ReminderValidation.LIST_QUERY>;
export type SnoozeInput = z.infer<typeof ReminderValidation.SNOOZE>;
