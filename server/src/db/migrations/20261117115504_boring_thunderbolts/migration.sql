CREATE TABLE "rate_limit" (
	"key" varchar(320) PRIMARY KEY,
	"count" integer NOT NULL,
	"reset_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "rate_limit_reset_at_idx" ON "rate_limit" ("reset_at");