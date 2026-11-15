CREATE TYPE "recurring_frequency" AS ENUM('DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY');--> statement-breakpoint
CREATE TYPE "recurring_plan_status" AS ENUM('ACTIVE', 'PAUSED', 'ENDED');--> statement-breakpoint
CREATE SEQUENCE "public"."recurring_plan_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "recurring_plan" (
	"id" varchar(20) PRIMARY KEY DEFAULT 'RPLAN' || lpad(nextval('recurring_plan_id_seq')::text, 3, '0'),
	"user_id" varchar(20) NOT NULL,
	"account_id" varchar(20) NOT NULL,
	"category_id" varchar(20),
	"name" varchar(100) NOT NULL,
	"type" "transaction_type" NOT NULL,
	"amount" bigint NOT NULL,
	"frequency" "recurring_frequency" NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"reminder_offsets" integer[] NOT NULL,
	"auto_record" boolean DEFAULT false NOT NULL,
	"next_due_date" date NOT NULL,
	"status" "recurring_plan_status" DEFAULT 'ACTIVE'::"recurring_plan_status" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recurring_plan_id_format" CHECK ("id" ~ '^RPLAN[0-9]{3,}$'),
	CONSTRAINT "recurring_plan_type" CHECK ("type" IN ('INCOME', 'OUTCOME')),
	CONSTRAINT "recurring_plan_amount_range" CHECK ("amount" > 0 AND "amount" <= 999999999999),
	CONSTRAINT "recurring_plan_end_after_start" CHECK ("end_date" IS NULL OR "end_date" > "start_date"),
	CONSTRAINT "recurring_plan_reminder_offsets" CHECK ("reminder_offsets" <@ ARRAY[0,1,3,7] AND cardinality("reminder_offsets") BETWEEN 1 AND 4)
);
--> statement-breakpoint
CREATE INDEX "recurring_plan_status_next_due_idx" ON "recurring_plan" ("status","next_due_date");--> statement-breakpoint
CREATE INDEX "recurring_plan_user_status_idx" ON "recurring_plan" ("user_id","status");--> statement-breakpoint
ALTER TABLE "recurring_plan" ADD CONSTRAINT "recurring_plan_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "recurring_plan" ADD CONSTRAINT "recurring_plan_account_id_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "account"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "recurring_plan" ADD CONSTRAINT "recurring_plan_category_id_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "category"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "transaction_image" DROP CONSTRAINT "transaction_image_transaction_id_transaction_id_fkey", ADD CONSTRAINT "transaction_image_transaction_id_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transaction"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "transaction_item" DROP CONSTRAINT "transaction_item_transaction_id_transaction_id_fkey", ADD CONSTRAINT "transaction_item_transaction_id_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transaction"("id") ON DELETE CASCADE;