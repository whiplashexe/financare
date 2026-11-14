import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  pgEnum,
  pgSequence,
  pgTable,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { users } from "./users.js";

export const categoryTypeEnum = pgEnum("category_type", ["INCOME", "OUTCOME"]);
export const categoryIdSeq = pgSequence("category_id_seq");

export const categories = pgTable(
  "categories",
  {
    id: varchar("id", { length: 20 })
      .primaryKey()
      .default(sql`'CAT' || lpad(nextval('category_id_seq')::text, 3, '0')`),
    userId: varchar("user_id", { length: 20 })
      .notNull()
      .references(() => users.id),
    name: varchar("name", { length: 50 }).notNull(),
    type: categoryTypeEnum("type").notNull(),
    icon: varchar("icon", { length: 50 }),
    isDefault: boolean("is_default").notNull().default(false),
    isFallback: boolean("is_fallback").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("category_user_type_name_unique").on(
      t.userId,
      t.type,
      sql`lower(${t.name})`,
    ),
    uniqueIndex("category_user_type_fallback_unique")
      .on(t.userId, t.type)
      .where(sql`${t.isFallback} = true`),
    index("category_user_id_idx").on(t.userId),
    check("category_id_format", sql`${t.id} ~ '^CAT[0-9]{3,}$'`),
    check(
      "category_fallback_is_default",
      sql`NOT ${t.isFallback} OR ${t.isDefault}`,
    ),
  ],
);
