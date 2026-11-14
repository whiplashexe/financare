import { sql } from "drizzle-orm";
import { varchar } from "drizzle-orm/cockroach-core";
import {
  AnyPgColumn,
  char,
  check,
  index,
  pgTable,
  timestamp,
} from "drizzle-orm/pg-core";
import { users } from "./users.js";

export const refreshTokens = pgTable(
  "refresh_token",
  {
    id: varchar("id", { length: 20 })
      .primaryKey()
      .default(sql`'RTK' || lpad(nextval('user_id_seq')::text, 3, '0')`),
    userId: varchar("user_id", { length: 20 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    familyId: varchar("family_id", { length: 36 }).notNull(),
    tokenHash: char("token_hash", { length: 64 }).notNull().unique(),
    deviceInfo: varchar("device_info", { length: 255 }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    replacedBy: varchar("replaced_by", { length: 20 }).references(
      (): AnyPgColumn => refreshTokens.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("refresh_token_user_id_idx").on(t.userId),
    index("refresh_token_family_id_idx").on(t.familyId),
    index("refresh_token_expires_at_idx").on(t.expiresAt),
    check("refresh_token_id_format", sql`${t.id} ~ '^RTK[0-9]{3,}$'`),
  ],
);
