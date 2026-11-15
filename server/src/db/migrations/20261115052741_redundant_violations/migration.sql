CREATE TYPE "one_time_plan_status" AS ENUM('PLANNED', 'DONE', 'MISSED', 'CANCELLED');--> statement-breakpoint
CREATE SEQUENCE "public"."one_time_plan_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "one_time_plan" (
	"id" varchar(20) PRIMARY KEY DEFAULT 'OPLAN' || lpad(nextval('one_time_plan_id_seq')::text, 3, '0'),
	"user_id" varchar(20) NOT NULL,
	"source_account_id" varchar(20),
	"name" varchar(100) NOT NULL,
	"date" date NOT NULL,
	"target_amount" bigint NOT NULL,
	"location" varchar(255),
	"note" text,
	"reminder_offsets" integer[] NOT NULL,
	"status" "one_time_plan_status" DEFAULT 'PLANNED'::"one_time_plan_status",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "one_time_plan_id_format" CHECK ("id" ~ '^OPLAN[0-9]{3,}$'),
	CONSTRAINT "one_time_plan_target_amount_range" CHECK ("target_amount" > 0 AND "target_amount" <= 999999999999),
	CONSTRAINT "one_time_plan_reminder_offsets" CHECK ("reminder_offsets" <@ ARRAY[1,3,7,14] AND cardinality("reminder_offsets") BETWEEN 1 AND 4)
);
--> statement-breakpoint
CREATE INDEX "transaction_recurring_plan_idx" ON "transaction" ("recurring_plan_id") WHERE "recurring_plan_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "transaction_one_time_plan_idx" ON "transaction" ("one_time_plan_id") WHERE "one_time_plan_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "one_time_plan_status_date_idx" ON "one_time_plan" ("status","date");--> statement-breakpoint
CREATE INDEX "one_time_plan_user_status_idx" ON "one_time_plan" ("user_id","status");--> statement-breakpoint
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_recurring_plan_id_recurring_plan_id_fkey" FOREIGN KEY ("recurring_plan_id") REFERENCES "recurring_plan"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_one_time_plan_id_one_time_plan_id_fkey" FOREIGN KEY ("one_time_plan_id") REFERENCES "one_time_plan"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "one_time_plan" ADD CONSTRAINT "one_time_plan_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "one_time_plan" ADD CONSTRAINT "one_time_plan_source_account_id_account_id_fkey" FOREIGN KEY ("source_account_id") REFERENCES "account"("id") ON DELETE SET NULL;