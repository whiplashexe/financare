CREATE TYPE "reminder_channel" AS ENUM('PUSH', 'EMAIL');--> statement-breakpoint
CREATE TYPE "reminder_status" AS ENUM('SCHEDULED', 'SENT', 'ACTED', 'SNOOZED', 'SKIPPED', 'FAILED');--> statement-breakpoint
CREATE SEQUENCE "public"."reminder_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "reminder" (
	"id" varchar(20) PRIMARY KEY DEFAULT 'RMD' || lpad(nextval('reminder_id_seq')::text, 3, '0'),
	"user_id" varchar(20) NOT NULL,
	"recurring_plan_id" varchar(20),
	"one_time_plan_id" varchar(20),
	"due_date" date NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"sent_at" timestamp with time zone,
	"chanel" "reminder_channel" DEFAULT 'PUSH'::"reminder_channel" NOT NULL,
	"status" "reminder_status" DEFAULT 'SCHEDULED'::"reminder_status" NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reminder_id_format" CHECK ("id" ~ '^RMD[0-9]{3,}$'),
	CONSTRAINT "reminder_exactly_one_plan" CHECK (("recurring_plan_id" IS NOT NULL) <> ("one_time_plan_id" IS NOT NULL)),
	CONSTRAINT "reminder_attempts_range" CHECK ("attempts" BETWEEN 0 AND 5)
);
--> statement-breakpoint
CREATE INDEX "reminder_status_scheduled_idx" ON "reminder" ("status","scheduled_at");--> statement-breakpoint
CREATE INDEX "reminder_user_status_idx" ON "reminder" ("user_id","status");--> statement-breakpoint
CREATE INDEX "reminder_recurring_plan_idx" ON "reminder" ("recurring_plan_id") WHERE "recurring_plan_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "reminder_one_time_plan_idx" ON "reminder" ("one_time_plan_id") WHERE "one_time_plan_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "reminder" ADD CONSTRAINT "reminder_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "reminder" ADD CONSTRAINT "reminder_recurring_plan_id_recurring_plan_id_fkey" FOREIGN KEY ("recurring_plan_id") REFERENCES "recurring_plan"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "reminder" ADD CONSTRAINT "reminder_one_time_plan_id_one_time_plan_id_fkey" FOREIGN KEY ("one_time_plan_id") REFERENCES "one_time_plan"("id") ON DELETE CASCADE;