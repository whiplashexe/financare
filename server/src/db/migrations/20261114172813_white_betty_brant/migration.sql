CREATE TYPE "device_platform" AS ENUM('ANDROID', 'IOS');--> statement-breakpoint
CREATE TYPE "account_status" AS ENUM('ACTIVE', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "account_type" AS ENUM('BANK', 'EWALLET', 'CASH');--> statement-breakpoint
CREATE TYPE "category_type" AS ENUM('INCOME', 'OUTCOME');--> statement-breakpoint
CREATE TYPE "transaction_source" AS ENUM('MANUAL', 'AUTO');--> statement-breakpoint
CREATE TYPE "transaction_type" AS ENUM('INCOME', 'OUTCOME', 'TRANSFER');--> statement-breakpoint
CREATE SEQUENCE "public"."user_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE SEQUENCE "public"."refresh_token_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE SEQUENCE "public"."password_reset_token_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE SEQUENCE "public"."device_token_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE SEQUENCE "public"."account_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE SEQUENCE "public"."category_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE SEQUENCE "public"."transaction_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "user" (
	"id" varchar(20) PRIMARY KEY DEFAULT 'USR' || lpad(nextval('user_id_seq')::text, 3, '0'),
	"name" varchar(100) NOT NULL,
	"email" varchar(254) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"timezone" varchar(64) DEFAULT 'Asia/Jakarta' NOT NULL,
	"hide_balance" boolean DEFAULT false NOT NULL,
	"notif_send_time" time DEFAULT '08:00' NOT NULL,
	"quiet_hours_start" time,
	"quiet_hours_end" time,
	"push_enabled" boolean DEFAULT true NOT NULL,
	"email_fallback" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_id_format" CHECK ("id" ~ '^USR[0-9]{3,}$'),
	CONSTRAINT "user_quiet_hours_pair" CHECK (("quiet_hours_start" IS NULL) = ("quiet_hours_end" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "refresh_token" (
	"id" varchar(20) PRIMARY KEY DEFAULT 'RTK' || lpad(nextval('refresh_token_id_seq')::text, 3, '0'),
	"user_id" varchar(20) NOT NULL,
	"family_id" varchar(36) NOT NULL,
	"token_hash" char(64) NOT NULL UNIQUE,
	"device_info" varchar(255),
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"replaced_by" varchar(20),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "refresh_token_id_format" CHECK ("id" ~ '^RTK[0-9]{3,}$')
);
--> statement-breakpoint
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
CREATE TABLE "device_token" (
	"id" varchar(20) PRIMARY KEY DEFAULT 'DVC' || lpad(nextval('device_token_id_seq')::text, 3, '0'),
	"user_id" varchar(20) NOT NULL,
	"token" varchar(512) NOT NULL UNIQUE,
	"platform" "device_platform" NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "device_token_id_format" CHECK ("id" ~ '^DVC[0-9]{3,}$')
);
--> statement-breakpoint
CREATE TABLE "account" (
	"id" varchar(20) PRIMARY KEY DEFAULT 'ACC' || lpad(nextval('account_id_seq')::text, 3, '0'),
	"user_id" varchar(20) NOT NULL,
	"name" varchar(50) NOT NULL,
	"type" "account_type" NOT NULL,
	"institution" varchar(50),
	"initial_balance" bigint DEFAULT 0 NOT NULL,
	"last4" char(4),
	"color" varchar(9),
	"include_in_total" boolean DEFAULT true NOT NULL,
	"status" "account_status" DEFAULT 'ACTIVE'::"account_status" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_id_format" CHECK ("id" ~ '^ACC[0-9]{3,}$'),
	CONSTRAINT "account_last4_format" CHECK ("last4" IS NULL OR "last4" ~ '^[0-9]{4}$'),
	CONSTRAINT "account_cash_no_institution" CHECK ("type" <> 'CASH' OR "institution" IS NULL),
	CONSTRAINT "account_initial_balance_range" CHECK ("initial_balance" BETWEEN -999999999999 AND 999999999999),
	CONSTRAINT "account_color_format" CHECK ("color" IS NULL OR "color" ~ '^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$')
);
--> statement-breakpoint
CREATE TABLE "category" (
	"id" varchar(20) PRIMARY KEY DEFAULT 'CAT' || lpad(nextval('category_id_seq')::text, 3, '0'),
	"user_id" varchar(20) NOT NULL,
	"name" varchar(50) NOT NULL,
	"type" "category_type" NOT NULL,
	"icon" varchar(50),
	"is_default" boolean DEFAULT false NOT NULL,
	"is_fallback" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "category_id_format" CHECK ("id" ~ '^CAT[0-9]{3,}$'),
	CONSTRAINT "category_fallback_is_default" CHECK (NOT "is_fallback" OR "is_default")
);
--> statement-breakpoint
CREATE TABLE "transaction" (
	"id" varchar(20) PRIMARY KEY DEFAULT 'TRANS' || lpad(nextval('transaction_id_seq')::text, 3, '0'),
	"user_id" varchar(20) NOT NULL,
	"account_id" varchar(20) NOT NULL,
	"to_account_id" varchar(20),
	"category_id" varchar(20),
	"parent_transaction_id" varchar(20),
	"recurring_plan_id" varchar(20),
	"one_time_plan_id" varchar(20),
	"type" "transaction_type" NOT NULL,
	"name" varchar(100) NOT NULL,
	"amount" bigint NOT NULL,
	"date" timestamp with time zone DEFAULT now() NOT NULL,
	"location" varchar(255),
	"note" text,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"source" "transaction_source" DEFAULT 'MANUAL'::"transaction_source" NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transaction_id_format" CHECK ("id" ~ '^TRANS[0-9]{3,}$'),
	CONSTRAINT "transaction_amount_range" CHECK ("amount" > 0 AND "amount" <= 999999999999),
	CONSTRAINT "transaction_transfer_has_destination" CHECK (("type" = 'TRANSFER') = ("to_account_id" IS NOT NULL)),
	CONSTRAINT "transaction_distinct_accounts" CHECK ("to_account_id" IS NULL OR "account_id" <> "to_account_id"),
	CONSTRAINT "transaction_transfer_no_category" CHECK ("type" <> 'TRANSFER' OR "category_id" IS NULL),
	CONSTRAINT "transaction_single_plan" CHECK (NOT ("recurring_plan_id" IS NOT NULL AND "one_time_plan_id" IS NOT NULL)),
	CONSTRAINT "transaction_fee_is_outcome" CHECK ("parent_transaction_id" IS NULL OR "type" = 'OUTCOME'),
	CONSTRAINT "transaction_tags_max" CHECK (cardinality("tags") <= 10)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "user_email_lower_unique" ON "user" (lower("email"));--> statement-breakpoint
CREATE INDEX "refresh_token_user_id_idx" ON "refresh_token" ("user_id");--> statement-breakpoint
CREATE INDEX "refresh_token_family_id_idx" ON "refresh_token" ("family_id");--> statement-breakpoint
CREATE INDEX "refresh_token_expires_at_idx" ON "refresh_token" ("expires_at");--> statement-breakpoint
CREATE INDEX "password_reset_token_user_id_idx" ON "password_reset_token" ("user_id");--> statement-breakpoint
CREATE INDEX "password_reset_token_expires_at_idx" ON "password_reset_token" ("expires_at");--> statement-breakpoint
CREATE INDEX "device_token_user_id_idx" ON "device_token" ("user_id");--> statement-breakpoint
CREATE INDEX "account_user_id_status_idx" ON "account" ("user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "category_user_type_name_unique" ON "category" ("user_id","type",lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "category_user_type_fallback_unique" ON "category" ("user_id","type") WHERE "is_fallback" = true;--> statement-breakpoint
CREATE INDEX "category_user_id_idx" ON "category" ("user_id");--> statement-breakpoint
CREATE INDEX "transaction_user_date_idx" ON "transaction" ("user_id","date" DESC NULLS LAST) WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "transaction_account_date_idx" ON "transaction" ("account_id","date" DESC NULLS LAST) WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "transaction_to_account_idx" ON "transaction" ("to_account_id") WHERE "to_account_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "transaction_user_category_date_idx" ON "transaction" ("user_id","category_id","date");--> statement-breakpoint
CREATE INDEX "transaction_deleted_at_idx" ON "transaction" ("deleted_at") WHERE "deleted_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "transaction_tags_gin_idx" ON "transaction" USING gin ("tags");--> statement-breakpoint
ALTER TABLE "refresh_token" ADD CONSTRAINT "refresh_token_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "refresh_token" ADD CONSTRAINT "refresh_token_replaced_by_refresh_token_id_fkey" FOREIGN KEY ("replaced_by") REFERENCES "refresh_token"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "password_reset_token" ADD CONSTRAINT "password_reset_token_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "device_token" ADD CONSTRAINT "device_token_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "category" ADD CONSTRAINT "category_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_account_id_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "account"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_to_account_id_account_id_fkey" FOREIGN KEY ("to_account_id") REFERENCES "account"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_category_id_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "category"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_parent_transaction_id_transaction_id_fkey" FOREIGN KEY ("parent_transaction_id") REFERENCES "transaction"("id") ON DELETE CASCADE;