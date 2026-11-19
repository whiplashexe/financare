ALTER TABLE "transaction_image" DROP CONSTRAINT "transaction_image_position_unique";--> statement-breakpoint
ALTER TABLE "transaction_image" ADD CONSTRAINT "transaction_image_position_unique" UNIQUE ("transaction_id", "position") DEFERRABLE INITIALLY DEFERRED;
