ALTER TABLE "transaction_image" ALTER COLUMN "public_id" SET DATA TYPE varchar(255) USING "public_id"::varchar(255);--> statement-breakpoint
ALTER TABLE "transaction_image" ALTER COLUMN "public_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "transaction_image" ADD CONSTRAINT "transaction_image_public_id_key" UNIQUE("public_id");