CREATE TABLE "user" (
	"id" varchar(20) PRIMARY KEY,
	"name" varchar(100) NOT NULL,
	"email" varchar(254) NOT NULL UNIQUE,
	"password_hash" varchar(255) NOT NULL,
	"timezone" varchar(64) DEFAULT 'Asia/Jakarta' NOT NULL,
	"hide_balance" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
