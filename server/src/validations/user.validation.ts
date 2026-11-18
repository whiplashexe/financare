import z from "zod";

const email = z
  .string()
  .trim()
  .max(254)
  .toLowerCase()
  .pipe(z.email("email format not valid"));

const device = z
  .object({
    platform: z.enum(["ANDROID", "IOS"]),
    name: z.string().trim().max(100).optional(),
  })
  .strict()
  .optional();

export const timezoneName = z
  .string()
  .trim()
  .refine(
    (tz) => {
      try {
        new Intl.DateTimeFormat("en-US", { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    },
    { message: "timezone must be a valid IANA name" },
  );

const timezone = timezoneName.default("Asia/Jakarta");

const refreshToken = z
  .string()
  .min(1, "refresh_token is required")
  .max(512, "refresh_token is too long");

const newPassword = z
  .string()
  .min(8, "password minimum 8 chars")
  .max(128, "password to long");

export class UserValidation {
  static REGISTER = z
    .object({
      name: z.string().trim().min(1, "name is required").max(100),
      email,
      password: z
        .string()
        .min(8, "password minimum 8 chars")
        .max(128, "password to long"),
      timezone,
      device,
    })
    .strict();

  static LOGIN = z
    .object({
      email,
      password: z
        .string()
        .min(1, "password required")
        .max(128, "password to long"),
      device,
    })
    .strict();

  static REFRESH = z.object({ refresh_token: refreshToken }).strict();

  static LOGOUT = z.object({ refresh_token: refreshToken }).strict();

  static FORGOT_PASSWORD = z.object({ email }).strict();

  static RESET_PASSWORD = z
    .object({
      token: z.string().min(1, "token is required").max(256),
      new_password: newPassword,
    })
    .strict();
}

export type RegisterInput = z.infer<typeof UserValidation.REGISTER>;
export type LoginInput = z.infer<typeof UserValidation.LOGIN>;
export type RefreshInput = z.infer<typeof UserValidation.REFRESH>;
export type LogoutInput = z.infer<typeof UserValidation.LOGOUT>;
export type ForgotPasswordInput = z.infer<typeof UserValidation.FORGOT_PASSWORD>;
export type ResetPasswordInput = z.infer<typeof UserValidation.RESET_PASSWORD>;
