CREATE TYPE "plan_occurrence_outcome" AS ENUM('CONFIRMED', 'SKIPPED', 'AUTO_RECORDED');--> statement-breakpoint
CREATE SEQUENCE "public"."plan_occurrence_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "plan_occurrence" (
	"id" varchar(20) PRIMARY KEY DEFAULT 'OCC' || lpad(nextval('plan_occurrence_id_seq')::text, 3, '0'),
	"recurring_plan_id" varchar(20) NOT NULL,
	"due_date" date NOT NULL,
	"outcome" "plan_occurrence_outcome" NOT NULL,
	"transaction_id" varchar(20),
	"resolved_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plan_occurrence_plan_due_unique" UNIQUE("recurring_plan_id","due_date"),
	CONSTRAINT "plan_occurrence_id_format" CHECK ("id" ~ '^OCC[0-9]{3,}$'),
	CONSTRAINT "plan_occurrence_skipped_no_transaction" CHECK ("outcome" <> 'SKIPPED' OR "transaction_id" IS NULL)
);
--> statement-breakpoint
CREATE INDEX "plan_occurrence_transaction_idx" ON "plan_occurrence" ("transaction_id") WHERE "transaction_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "plan_occurrence" ADD CONSTRAINT "plan_occurrence_recurring_plan_id_recurring_plan_id_fkey" FOREIGN KEY ("recurring_plan_id") REFERENCES "recurring_plan"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "plan_occurrence" ADD CONSTRAINT "plan_occurrence_transaction_id_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transaction"("id") ON DELETE SET NULL;