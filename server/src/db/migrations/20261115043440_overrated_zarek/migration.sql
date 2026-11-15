CREATE SEQUENCE "public"."transaction_image_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE SEQUENCE "public"."transaction_item_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "transaction_image" (
	"id" varchar(20) PRIMARY KEY DEFAULT 'IMG' || lpad(nextval('transaction_image_id_seq')::text, 3, '0'),
	"transaction_id" varchar(20) NOT NULL,
	"public_id" varchar(20),
	"mime_type" varchar(20) NOT NULL,
	"size" integer NOT NULL,
	"position" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transaction_image_position_unique" UNIQUE("transaction_id","position"),
	CONSTRAINT "transaction_image_id_format" CHECK ("id" ~ '^IMG[0-9]{3,}$'),
	CONSTRAINT "transaction_image_position_range" CHECK ("position" BETWEEN 0 AND 4),
	CONSTRAINT "transaction_image_size_range" CHECK ("size" BETWEEN 1 AND 5242880),
	CONSTRAINT "transaction_image_mime_type" CHECK ("mime_type" IN ('image/jpeg', 'image/png', 'image/heic'))
);
--> statement-breakpoint
CREATE TABLE "transaction_item" (
	"id" varchar(20) PRIMARY KEY DEFAULT 'ITM' || lpad(nextval('transaction_item_id_seq')::text, 3, '0'),
	"transaction_id" varchar(20) NOT NULL,
	"name" varchar(150) NOT NULL,
	"quantity" numeric(10,3),
	"unit" varchar(20),
	"total_price" bigint NOT NULL,
	"position" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transaction_item_position_unique" UNIQUE("transaction_id","position"),
	CONSTRAINT "transaction_item_id_format" CHECK ("id" ~ '^ITM[0-9]{3,}$'),
	CONSTRAINT "transaction_item_quantity_range" CHECK ("quantity" > 0 AND "quantity" <= 9999999.999),
	CONSTRAINT "transaction_item_total_price_range" CHECK ("total_price" BETWEEN 0 AND 999999999999),
	CONSTRAINT "transaction_item_position_range" CHECK ("position" BETWEEN 0 AND 99)
);
--> statement-breakpoint
CREATE INDEX "transaction_image_transaction_id_idx" ON "transaction_image" ("transaction_id");--> statement-breakpoint
CREATE INDEX "transaction_item_transaction_id_idx" ON "transaction_item" ("transaction_id");--> statement-breakpoint
ALTER TABLE "transaction_image" ADD CONSTRAINT "transaction_image_transaction_id_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transaction"("id");--> statement-breakpoint
ALTER TABLE "transaction_item" ADD CONSTRAINT "transaction_item_transaction_id_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transaction"("id");