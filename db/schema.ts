import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  index,
  integer,
  primaryKey,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey(),
    shareId: varchar("share_id", { length: 24 }).notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    editTokenHash: varchar("edit_token_hash", { length: 64 }).notNull(),
    idempotencyKeyHash: varchar("idempotency_key_hash", { length: 64 }),
    idempotencyPayloadHash: varchar("idempotency_payload_hash", { length: 64 }),
    revision: integer("revision").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("projects_share_id_unique").on(table.shareId),
    uniqueIndex("projects_edit_token_hash_unique").on(table.editTokenHash),
    uniqueIndex("projects_idempotency_key_hash_unique").on(
      table.idempotencyKeyHash,
    ),
    check(
      "projects_share_id_format_check",
      sql`${table.shareId} ~ '^p_[A-Za-z0-9_-]{22}$'`,
    ),
    check(
      "projects_name_length_check",
      sql`char_length(btrim(${table.name})) between 1 and 200`,
    ),
    check("projects_edit_token_hash_check", sql`${table.editTokenHash} ~ '^[0-9a-f]{64}$'`),
    check(
      "projects_idempotency_hashes_check",
      sql`(${table.idempotencyKeyHash} is null and ${table.idempotencyPayloadHash} is null) or (${table.idempotencyKeyHash} ~ '^[0-9a-f]{64}$' and ${table.idempotencyPayloadHash} ~ '^[0-9a-f]{64}$')`,
    ),
    check("projects_revision_check", sql`${table.revision} >= 1`),
  ],
);

export const groups = pgTable(
  "groups",
  {
    id: uuid("id").primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    clientId: uuid("client_id"),
    name: varchar("name", { length: 200 }).notNull(),
    sortOrder: integer("sort_order").notNull(),
    note: text("note"),
    lastViewedPage: integer("last_viewed_page").notNull().default(1),
    pdfGeneration: integer("pdf_generation").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("groups_project_sort_order_unique").on(
      table.projectId,
      table.sortOrder,
    ),
    unique("groups_project_client_id_unique").on(
      table.projectId,
      table.clientId,
    ),
    index("groups_project_sort_order_idx").on(table.projectId, table.sortOrder),
    check(
      "groups_name_length_check",
      sql`char_length(btrim(${table.name})) between 1 and 200`,
    ),
    check("groups_sort_order_check", sql`${table.sortOrder} >= 0`),
    check(
      "groups_note_length_check",
      sql`${table.note} is null or char_length(${table.note}) <= 2000`,
    ),
    check("groups_last_viewed_page_check", sql`${table.lastViewedPage} >= 1`),
    check("groups_pdf_generation_check", sql`${table.pdfGeneration} >= 0`),
  ],
);

export const rateLimitBuckets = pgTable(
  "rate_limit_buckets",
  {
    scope: varchar("scope", { length: 40 }).notNull(),
    keyHash: varchar("key_hash", { length: 64 }).notNull(),
    windowStart: timestamp("window_start", { withTimezone: true, mode: "date" })
      .notNull(),
    requestCount: integer("request_count").notNull().default(1),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      name: "rate_limit_buckets_pk",
      columns: [table.scope, table.keyHash, table.windowStart],
    }),
    index("rate_limit_buckets_window_idx").on(table.windowStart),
    check("rate_limit_buckets_scope_check", sql`char_length(${table.scope}) between 1 and 40`),
    check("rate_limit_buckets_key_hash_check", sql`${table.keyHash} ~ '^[0-9a-f]{64}$'`),
    check("rate_limit_buckets_request_count_check", sql`${table.requestCount} >= 1`),
  ],
);

export const blobDeletionOutbox = pgTable(
  "blob_deletion_outbox",
  {
    blobPath: text("blob_path").primaryKey(),
    attemptCount: integer("attempt_count").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .defaultNow(),
    lastError: text("last_error"),
    completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("blob_deletion_outbox_due_idx").on(
      table.completedAt,
      table.nextAttemptAt,
    ),
    check(
      "blob_deletion_outbox_path_check",
      sql`char_length(${table.blobPath}) between 1 and 1024`,
    ),
    check(
      "blob_deletion_outbox_attempt_count_check",
      sql`${table.attemptCount} >= 0`,
    ),
    check(
      "blob_deletion_outbox_last_error_check",
      sql`${table.lastError} is null or char_length(${table.lastError}) <= 1000`,
    ),
  ],
);

export const pdfFiles = pgTable(
  "pdf_files",
  {
    id: uuid("id").primaryKey(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    originalName: varchar("original_name", { length: 255 }).notNull(),
    blobUrl: text("blob_url").notNull(),
    blobPath: text("blob_path").notNull(),
    pageCount: integer("page_count").notNull(),
    fileSize: bigint("file_size", { mode: "number" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("pdf_files_group_id_unique").on(table.groupId),
    uniqueIndex("pdf_files_blob_path_unique").on(table.blobPath),
    uniqueIndex("pdf_files_blob_url_unique").on(table.blobUrl),
    check("pdf_files_page_count_check", sql`${table.pageCount} between 1 and 1000000`),
    check(
      "pdf_files_file_size_check",
      sql`${table.fileSize} between 1 and 1572864000`,
    ),
  ],
);

export type ProjectRow = typeof projects.$inferSelect;
export type GroupRow = typeof groups.$inferSelect;
export type PdfFileRow = typeof pdfFiles.$inferSelect;
export type BlobDeletionOutboxRow = typeof blobDeletionOutbox.$inferSelect;
