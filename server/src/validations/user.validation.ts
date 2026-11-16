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

export class UserValidation {
  static REGISTER = z
    .object({
      name: z.string().trim().min(1, "name is required").max(100),
      email,
      password: z
        .string()
        .min(8, "password minimum 8 chars")
        .max(128, "password to long"),
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
}

export type RegisterInput = z.infer<typeof UserValidation.REGISTER>;
export type LoginInput = z.infer<typeof UserValidation.LOGIN>;
