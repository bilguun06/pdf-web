import "server-only";

export const DEFAULT_CLOUD_PROJECT_NAME = "Шинэ PDF төсөл";
export const MAX_PROJECT_NAME_LENGTH = 200;
export const MAX_GROUP_NAME_LENGTH = 200;
export const MAX_GROUP_NOTE_LENGTH = 2_000;
export const MAX_GROUPS_PER_PROJECT = 500;
export const MAX_PDF_PAGE_COUNT = 1_000_000;
export const MAX_PDF_SIZE_BYTES = 1_500 * 1024 * 1024;
export const MAX_PROJECT_STORAGE_BYTES = 10 * 1024 * 1024 * 1024;
export const MAX_JSON_BODY_BYTES = 2 * 1024 * 1024;
export const MULTIPART_UPLOAD_THRESHOLD_BYTES = 100 * 1024 * 1024;

export const PDF_CONTENT_TYPE = "application/pdf";
export const SHARE_ID_PATTERN = /^p_[A-Za-z0-9_-]{22}$/;
export const EDIT_TOKEN_PATTERN = /^e_[A-Za-z0-9_-]{43}$/;
export const IDEMPOTENCY_KEY_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
export const PROJECT_CREATE_RATE_LIMIT = 5;
export const BLOB_TOKEN_RATE_LIMIT_PER_PROJECT = 60;
export const BLOB_TOKEN_RATE_LIMIT_PER_IP = 120;
export const BLOB_RATE_LIMIT_MIB_BYTES = 1024 * 1024;
export const BLOB_UPLOAD_RATE_LIMIT_PER_IP_MIB = 20 * 1024;
export const BLOB_UPLOAD_RATE_LIMIT_GLOBAL_MIB = 100 * 1024;
