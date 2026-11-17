import { sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { users } from "../../db/schema/users.js";
import { RegisterInput } from "../../validations/user.validation.js";
import { hashPassword } from "../../utils/password.util.js";
import { ApiError } from "../../utils/api.error.util.js";
import { AUTH_MESSAGE } from "../../constants/response.message.js";
import { createDefaultCategories } from "../../db/seeds/create.default.categories.js";
import {
  createSession,
  describeDevice,
} from "../../utils/auth.session.util.js";

export const register = async ({
  input,
  deviceInfo,
}: {
  input: RegisterInput;
  deviceInfo?: string | undefined;
}) => {
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.email}) = ${input.email.toLowerCase()}`)
    .limit(1);

  if (existing.length > 0)
    throw ApiError.conflict(AUTH_MESSAGE.EMAIL_ALREADY_EXISTS);

  const passwordHash = await hashPassword(input.password);

  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(users)
      .values({
        name: input.name,
        email: input.email,
        passwordHash,
        timezone: input.timezone,
      })
      .returning({
        id: users.id,
        name: users.name,
        email: users.email,
        timezone: users.timezone,
      });

    await createDefaultCategories(tx, created!.id);

    const session = await createSession({
      executor: tx,
      userId: created!.id,
      deviceInfo: describeDevice(input.device, deviceInfo),
    });

    return { user: created!, ...session };
  });
};
