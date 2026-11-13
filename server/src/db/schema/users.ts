import { boolean, pgTable, timestamp, varchar } from "drizzle-orm/pg-core";

export const users = pgTable("user", {
  id: varchar("id", { length: 20 }).primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  email: varchar("email", { length: 254 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  timezone: varchar("timezone", { length: 64 })
    .notNull()
    .default("Asia/Jakarta"),
  hideBalance: boolean("hide_balance").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
