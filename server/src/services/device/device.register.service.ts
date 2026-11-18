import { sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { deviceTokens } from "../../db/schema/device.tokens.js";
import { RegisterDeviceInput } from "../../validations/device.validation.js";

export const registerDevice = async ({
  userId,
  input,
}: {
  userId: string;
  input: RegisterDeviceInput;
}) => {
  const [row] = await db
    .insert(deviceTokens)
    .values({
      userId,
      token: input.push_token,
      platform: input.platform,
    })
    .onConflictDoUpdate({
      target: deviceTokens.token,
      set: {
        userId,
        platform: input.platform,
        lastSeenAt: sql`now()`,
      },
    })
    .returning({ id: deviceTokens.id });

  return { id: row!.id };
};
