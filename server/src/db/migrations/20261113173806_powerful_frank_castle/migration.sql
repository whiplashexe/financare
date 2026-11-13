CREATE SEQUENCE "public"."user_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
ALTER TABLE "user" DROP CONSTRAINT "user_email_key";--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "notif_send_time" time DEFAULT '08:00' NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "quiet_hours_start" time;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "quiet_hours_end" time;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "push_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "email_fallback" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "id" SET DEFAULT 'USR' || lpad(nextval('user_id_seq')::text, 3, '0');--> statement-breakpoint
CREATE UNIQUE INDEX "user_email_lower_unique" ON "user" (lower("email"));--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_id_format" CHECK ("id" ~ '^USR[0-9]{3,}$');--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_quiet_hours_pair" CHECK (("quiet_hours_start" IS NULL) = ("quiet_hours_end" IS NULL));