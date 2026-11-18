import z from "zod";

export class DeviceValidation {
  static REGISTER = z
    .object({
      platform: z.enum(["ANDROID", "IOS"]),
      push_token: z
        .string()
        .trim()
        .min(1, "push_token is required")
        .max(512, "push_token is too long"),
    })
    .strict();

  static PARAMS = z.object({ id: z.string().min(1).max(20) });
}

export type RegisterDeviceInput = z.infer<typeof DeviceValidation.REGISTER>;
