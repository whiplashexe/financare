import z from "zod";
import { timezoneName } from "./user.validation.js";

const clock = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "time must be HH:MM (24 hours)");

const newPassword = z
  .string()
  .min(8, "password minimum 8 chars")
  .max(128, "password to long");

const atLeastOneField = (value: object) => Object.keys(value).length > 0;

export class MeValidation {
  static UPDATE_PROFILE = z
    .object({
      name: z.string().trim().min(1, "name is required").max(100).optional(),
      timezone: timezoneName.optional(),
    })
    .strict()
    .refine(atLeastOneField, { message: "at least one field is required" });

  static CHANGE_PASSWORD = z
    .object({
      current_password: z
        .string()
        .min(1, "current_password is required")
        .max(128, "password to long"),
      new_password: newPassword,
    })
    .strict();

  static NOTIFICATION_PREFERENCES = z
    .object({
      send_time: clock.optional(),
      quiet_hours: z
        .object({ start: clock, end: clock })
        .strict()
        .refine((q) => q.start !== q.end, {
          message: "quiet hours start and end must differ",
        })
        .nullable()
        .optional(),
      push: z.boolean().optional(),
      email_fallback: z.boolean().optional(),
    })
    .strict()
    .refine(atLeastOneField, { message: "at least one field is required" });

  static PREFERENCES = z.object({ hide_balance: z.boolean() }).strict();

  static DELETE_ACCOUNT = z
    .object({
      password: z
        .string()
        .min(1, "password is required")
        .max(128, "password to long"),
    })
    .strict();
}

export type UpdateProfileInput = z.infer<typeof MeValidation.UPDATE_PROFILE>;
export type ChangePasswordInput = z.infer<typeof MeValidation.CHANGE_PASSWORD>;
export type NotificationPreferencesInput = z.infer<
  typeof MeValidation.NOTIFICATION_PREFERENCES
>;
export type PreferencesInput = z.infer<typeof MeValidation.PREFERENCES>;
export type DeleteAccountInput = z.infer<typeof MeValidation.DELETE_ACCOUNT>;
