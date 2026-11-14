import { sql } from "drizzle-orm";
import {
  check,
  index,
  pgEnum,
  pgSequence,
  pgTable,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { users } from "./users.js";

export const deviceTokenIdSeq = pgSequence("device_token_id_seq");
export const devicePlatformEnum = pgEnum("device_platform", ["ANDROID", "IOS"]);

export const deviceTokens = pgTable(
  "device_token",
  {
    id: varchar("id", { length: 20 })
      .primaryKey()
      .default(
        sql`'DVC' || lpad(nextval('device_token_id_seq')::text, 3, '0')`,
      ),
    userId: varchar("user_id", { length: 20 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: varchar("token", { length: 512 }).notNull().unique(),
    platform: devicePlatformEnum("platform").notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("device_token_user_id_idx").on(t.userId),
    check("device_token_id_format", sql`${t.id} ~ '^DVC[0-9]{3,}$'`),
  ],
);
