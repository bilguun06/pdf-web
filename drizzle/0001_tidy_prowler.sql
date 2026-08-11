CREATE TABLE "blob_deletion_outbox" (
	"blob_path" text PRIMARY KEY NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "blob_deletion_outbox_path_check" CHECK (char_length("blob_deletion_outbox"."blob_path") between 1 and 1024),
	CONSTRAINT "blob_deletion_outbox_attempt_count_check" CHECK ("blob_deletion_outbox"."attempt_count" >= 0),
	CONSTRAINT "blob_deletion_outbox_last_error_check" CHECK ("blob_deletion_outbox"."last_error" is null or char_length("blob_deletion_outbox"."last_error") <= 1000)
);
--> statement-breakpoint
CREATE TABLE "rate_limit_buckets" (
	"scope" varchar(40) NOT NULL,
	"key_hash" varchar(64) NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"request_count" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rate_limit_buckets_pk" PRIMARY KEY("scope","key_hash","window_start"),
	CONSTRAINT "rate_limit_buckets_scope_check" CHECK (char_length("rate_limit_buckets"."scope") between 1 and 40),
	CONSTRAINT "rate_limit_buckets_key_hash_check" CHECK ("rate_limit_buckets"."key_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "rate_limit_buckets_request_count_check" CHECK ("rate_limit_buckets"."request_count" >= 1)
);
--> statement-breakpoint
ALTER TABLE "groups" ADD COLUMN "client_id" uuid;--> statement-breakpoint
ALTER TABLE "groups" ADD COLUMN "pdf_generation" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "idempotency_key_hash" varchar(64);--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "idempotency_payload_hash" varchar(64);--> statement-breakpoint
CREATE INDEX "blob_deletion_outbox_due_idx" ON "blob_deletion_outbox" USING btree ("completed_at","next_attempt_at");--> statement-breakpoint
CREATE INDEX "rate_limit_buckets_window_idx" ON "rate_limit_buckets" USING btree ("window_start");--> statement-breakpoint
CREATE UNIQUE INDEX "projects_idempotency_key_hash_unique" ON "projects" USING btree ("idempotency_key_hash");--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_project_client_id_unique" UNIQUE("project_id","client_id");--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_pdf_generation_check" CHECK ("groups"."pdf_generation" >= 0);--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_idempotency_hashes_check" CHECK (("projects"."idempotency_key_hash" is null and "projects"."idempotency_payload_hash" is null) or ("projects"."idempotency_key_hash" ~ '^[0-9a-f]{64}$' and "projects"."idempotency_payload_hash" ~ '^[0-9a-f]{64}$'));