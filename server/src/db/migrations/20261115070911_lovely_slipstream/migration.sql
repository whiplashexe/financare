CREATE SEQUENCE "public"."transaction_template_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "idempotency_key" (
	"key" varchar(64),
	"user_id" varchar(20),
	"route" varchar(100) NOT NULL,
	"response" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "idempotency_key_pkey" PRIMARY KEY("user_id","key"),
	CONSTRAINT "idempotency_key_key_not_empty" CHECK (length("key") >= 1),
	CONSTRAINT "idempotency_key_route_not_empty" CHECK (length("route") >= 1)
);
--> statement-breakpoint
CREATE TABLE "transaction_template" (
	"id" varchar(20) PRIMARY KEY DEFAULT 'TPL' || lpad(nextval('transaction_template_id_seq')::text, 3, '0'),
	"user_id" varchar(20) NOT NULL,
	"name" varchar(50) NOT NULL,
	"type" "transaction_type" NOT NULL,
	"transaction_name" varchar(100) NOT NULL,
	"amount" bigint,
	"account_id" varchar(20),
	"to_account_id" varchar(20),
	"category_id" varchar(20),
	"location" varchar(255),
	"note" text,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"use_count" integer DEFAULT 0 NOT NULL,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transaction_template_id_format" CHECK ("id" ~ '^TPL[0-9]{3,}$'),
	CONSTRAINT "transaction_template_amount_range" CHECK ("amount" IS NULL OR ("amount" > 0 AND "amount" <= 999999999999)),
	CONSTRAINT "transaction_template_destination_only_transfer" CHECK ("type" = 'TRANSFER' OR "to_account_id" IS NULL),
	CONSTRAINT "transaction_template_transfer_no_category" CHECK ("type" <> 'TRANSFER' OR "category_id" IS NULL),
	CONSTRAINT "transaction_template_distinct_accounts" CHECK ("account_id" IS NULL OR "to_account_id" IS NULL OR "account_id" <> "to_account_id"),
	CONSTRAINT "transaction_template_tags_max" CHECK (cardinality("tags") <= 10),
	CONSTRAINT "transaction_template_use_count" CHECK ("use_count" >= 0)
);
--> statement-breakpoint
CREATE INDEX "idempotency_key_created_at_idx" ON "idempotency_key" ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "transaction_template_user_name_unique" ON "transaction_template" ("user_id",lower("name"));--> statement-breakpoint
CREATE INDEX "transaction_template_user_usage_idx" ON "transaction_template" ("user_id","use_count" DESC NULLS LAST,"last_used_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "transaction_template_account_idx" ON "transaction_template" ("account_id") WHERE "account_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "transaction_template_to_account_idx" ON "transaction_template" ("to_account_id") WHERE "to_account_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "transaction_template_category_idx" ON "transaction_template" ("category_id") WHERE "category_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "idempotency_key" ADD CONSTRAINT "idempotency_key_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "transaction_template" ADD CONSTRAINT "transaction_template_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "transaction_template" ADD CONSTRAINT "transaction_template_account_id_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "account"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "transaction_template" ADD CONSTRAINT "transaction_template_to_account_id_account_id_fkey" FOREIGN KEY ("to_account_id") REFERENCES "account"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "transaction_template" ADD CONSTRAINT "transaction_template_category_id_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "category"("id") ON DELETE SET NULL;