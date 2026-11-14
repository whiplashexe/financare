import { sql } from "drizzle-orm";
import {
  char,
  check,
  index,
  pgSequence,
  pgTable,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { users } from "./users.js";

export const passwordResetTokenIdSeq = pgSequence(
  "password_reset_token_id_seq",
);

export const passwordResetTokens = pgTable(
  "password_reset_token",
  {
    id: varchar("id", { length: 20 })
      .primaryKey()
      .default(
        sql`'PRT' || lpad(nextval('password_reset_token_id_seq')::text, 3, '0')`,
      ),
    userId: varchar("user_id", { length: 20 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: char("token_hash", { length: 64 }).notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("password_reset_token_user_id_idx").on(t.userId),
    index("password_reset_token_expires_at_idx").on(t.expiresAt),
    check("password_reset_token_id_format", sql`${t.id} ~ '^PRT[0-9]{3,}$'`),
  ],
);
