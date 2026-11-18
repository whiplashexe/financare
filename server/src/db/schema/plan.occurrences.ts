import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  pgEnum,
  pgSequence,
  pgTable,
  timestamp,
  unique,
  varchar,
} from "drizzle-orm/pg-core";
import { recurringPlans } from "./recurring.plans.js";
import { transactions } from "./transactions.js";

export const planOccurrenceOutcomeEnum = pgEnum("plan_occurrence_outcome", [
  "CONFIRMED",
  "SKIPPED",
  "AUTO_RECORDED",
]);

export const planOccurrenceIdSeq = pgSequence("plan_occurrence_id_seq");

export const planOccurrences = pgTable(
  "plan_occurrence",
  {
    id: varchar("id", { length: 20 })
      .primaryKey()
      .default(
        sql`prefixed_id('OCC', nextval('plan_occurrence_id_seq'))`,
      ),
    recurringPlanId: varchar("recurring_plan_id", { length: 20 })
      .notNull()
      .references(() => recurringPlans.id, { onDelete: "cascade" }),
    dueDate: date("due_date", { mode: "string" }).notNull(),
    outcome: planOccurrenceOutcomeEnum("outcome").notNull(),
    transactionId: varchar("transaction_id", { length: 20 }).references(
      () => transactions.id,
      { onDelete: "set null" },
    ),
    resolvedAt: timestamp("resolved_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("plan_occurrence_plan_due_unique").on(t.recurringPlanId, t.dueDate),
    index("plan_occurrence_transaction_idx")
      .on(t.transactionId)
      .where(sql`${t.transactionId} IS NOT NULL`),
    check("plan_occurrence_id_format", sql`${t.id} ~ '^OCC[0-9]{3,}$'`),
    check(
      "plan_occurrence_skipped_no_transaction",
      sql`${t.outcome} <> 'SKIPPED' OR ${t.transactionId} IS NULL`,
    ),
  ],
);
