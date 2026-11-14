CREATE SEQUENCE "public"."password_reset_token_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "password_reset_token" (
	"id" varchar(20) PRIMARY KEY DEFAULT 'PRT' || lpad(nextval('password_reset_token_id_seq')::text, 3, '0'),
	"user_id" varchar(20) NOT NULL,
	"token_hash" char(64) NOT NULL UNIQUE,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "password_reset_token_id_format" CHECK ("id" ~ '^PRT[0-9]{3,}$')
);
--> statement-breakpoint
CREATE INDEX "password_reset_token_user_id_idx" ON "password_reset_token" ("user_id");--> statement-breakpoint
CREATE INDEX "password_reset_token_expires_at_idx" ON "password_reset_token" ("expires_at");--> statement-breakpoint
ALTER TABLE "password_reset_token" ADD CONSTRAINT "password_reset_token_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;