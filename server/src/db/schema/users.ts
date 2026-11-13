import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  pgSequence,
  pgTable,
  time,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

export const userIdSeq = pgSequence("user_id_seq");

export const users = pgTable(
  "user",
  {
    id: varchar("id", { length: 20 })
      .primaryKey()
      .default(sql`'USR' || lpad(nextval('user_id_seq')::text, 3, '0')`),
    name: varchar("name", { length: 100 }).notNull(),
    email: varchar("email", { length: 254 }).notNull(),
    passwordHash: varchar("password_hash", { length: 255 }).notNull(),
    timezone: varchar("timezone", { length: 64 })
      .notNull()
      .default("Asia/Jakarta"),
    hideBalance: boolean("hide_balance").notNull().default(false),
    notifSendTime: time("notif_send_time").notNull().default("08:00"),
    quietHoursStart: time("quiet_hours_start"),
    quietHoursEnd: time("quiet_hours_end"),
    pushEnabled: boolean("push_enabled").notNull().default(true),
    emailFallback: boolean("email_fallback").notNull().default(false),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("user_email_lower_unique").on(sql`lower(${t.email})`),
    check("user_id_format", sql`${t.id} ~ '^USR[0-9]{3,}$'`),
    check(
      "user_quiet_hours_pair",
      sql`(${t.quietHoursStart} IS NULL) = (${t.quietHoursEnd} IS NULL)`,
    ),
  ],
);
