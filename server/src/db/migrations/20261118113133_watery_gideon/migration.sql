ALTER TABLE "user" ALTER COLUMN "id" SET DEFAULT prefixed_id('USR', nextval('user_id_seq'));--> statement-breakpoint
ALTER TABLE "refresh_token" ALTER COLUMN "id" SET DEFAULT prefixed_id('RTK', nextval('refresh_token_id_seq'));--> statement-breakpoint
ALTER TABLE "password_reset_token" ALTER COLUMN "id" SET DEFAULT prefixed_id('PRT', nextval('password_reset_token_id_seq'));--> statement-breakpoint
ALTER TABLE "device_token" ALTER COLUMN "id" SET DEFAULT prefixed_id('DVC', nextval('device_token_id_seq'));--> statement-breakpoint
ALTER TABLE "account" ALTER COLUMN "id" SET DEFAULT prefixed_id('ACC', nextval('account_id_seq'));--> statement-breakpoint
ALTER TABLE "category" ALTER COLUMN "id" SET DEFAULT prefixed_id('CAT', nextval('category_id_seq'));--> statement-breakpoint
ALTER TABLE "transaction" ALTER COLUMN "id" SET DEFAULT prefixed_id('TRANS', nextval('transaction_id_seq'));--> statement-breakpoint
ALTER TABLE "transaction_image" ALTER COLUMN "id" SET DEFAULT prefixed_id('IMG', nextval('transaction_image_id_seq'));--> statement-breakpoint
ALTER TABLE "transaction_item" ALTER COLUMN "id" SET DEFAULT prefixed_id('ITM', nextval('transaction_item_id_seq'));--> statement-breakpoint
ALTER TABLE "recurring_plan" ALTER COLUMN "id" SET DEFAULT prefixed_id('RPLAN', nextval('recurring_plan_id_seq'));--> statement-breakpoint
ALTER TABLE "one_time_plan" ALTER COLUMN "id" SET DEFAULT prefixed_id('OPLAN', nextval('one_time_plan_id_seq'));--> statement-breakpoint
ALTER TABLE "plan_occurrence" ALTER COLUMN "id" SET DEFAULT prefixed_id('OCC', nextval('plan_occurrence_id_seq'));--> statement-breakpoint
ALTER TABLE "reminder" ALTER COLUMN "id" SET DEFAULT prefixed_id('RMD', nextval('reminder_id_seq'));--> statement-breakpoint
ALTER TABLE "transaction_template" ALTER COLUMN "id" SET DEFAULT prefixed_id('TPL', nextval('transaction_template_id_seq'));