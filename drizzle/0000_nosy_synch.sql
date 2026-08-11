CREATE TABLE "groups" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"sort_order" integer NOT NULL,
	"note" text,
	"last_viewed_page" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "groups_project_sort_order_unique" UNIQUE("project_id","sort_order"),
	CONSTRAINT "groups_name_length_check" CHECK (char_length(btrim("groups"."name")) between 1 and 200),
	CONSTRAINT "groups_sort_order_check" CHECK ("groups"."sort_order" >= 0),
	CONSTRAINT "groups_note_length_check" CHECK ("groups"."note" is null or char_length("groups"."note") <= 2000),
	CONSTRAINT "groups_last_viewed_page_check" CHECK ("groups"."last_viewed_page" >= 1)
);
--> statement-breakpoint
CREATE TABLE "pdf_files" (
	"id" uuid PRIMARY KEY NOT NULL,
	"group_id" uuid NOT NULL,
	"original_name" varchar(255) NOT NULL,
	"blob_url" text NOT NULL,
	"blob_path" text NOT NULL,
	"page_count" integer NOT NULL,
	"file_size" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pdf_files_page_count_check" CHECK ("pdf_files"."page_count" between 1 and 1000000),
	CONSTRAINT "pdf_files_file_size_check" CHECK ("pdf_files"."file_size" between 1 and 1572864000)
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY NOT NULL,
	"share_id" varchar(24) NOT NULL,
	"name" varchar(200) NOT NULL,
	"edit_token_hash" varchar(64) NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projects_share_id_format_check" CHECK ("projects"."share_id" ~ '^p_[A-Za-z0-9_-]{22}$'),
	CONSTRAINT "projects_name_length_check" CHECK (char_length(btrim("projects"."name")) between 1 and 200),
	CONSTRAINT "projects_edit_token_hash_check" CHECK ("projects"."edit_token_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "projects_revision_check" CHECK ("projects"."revision" >= 1)
);
--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pdf_files" ADD CONSTRAINT "pdf_files_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "groups_project_sort_order_idx" ON "groups" USING btree ("project_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "pdf_files_group_id_unique" ON "pdf_files" USING btree ("group_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pdf_files_blob_path_unique" ON "pdf_files" USING btree ("blob_path");--> statement-breakpoint
CREATE UNIQUE INDEX "pdf_files_blob_url_unique" ON "pdf_files" USING btree ("blob_url");--> statement-breakpoint
CREATE UNIQUE INDEX "projects_share_id_unique" ON "projects" USING btree ("share_id");--> statement-breakpoint
CREATE UNIQUE INDEX "projects_edit_token_hash_unique" ON "projects" USING btree ("edit_token_hash");