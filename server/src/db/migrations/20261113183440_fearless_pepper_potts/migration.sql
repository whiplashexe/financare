CREATE TABLE "refresh_token" (
	"id" varchar(20) PRIMARY KEY DEFAULT 'RTK' || lpad(nextval('user_id_seq')::text, 3, '0'),
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
CREATE INDEX "refresh_token_user_id_idx" ON "refresh_token" ("user_id");--> statement-breakpoint
CREATE INDEX "refresh_token_family_id_idx" ON "refresh_token" ("family_id");--> statement-breakpoint
CREATE INDEX "refresh_token_expires_at_idx" ON "refresh_token" ("expires_at");--> statement-breakpoint
ALTER TABLE "refresh_token" ADD CONSTRAINT "refresh_token_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "refresh_token" ADD CONSTRAINT "refresh_token_replaced_by_refresh_token_id_fkey" FOREIGN KEY ("replaced_by") REFERENCES "refresh_token"("id") ON DELETE SET NULL;