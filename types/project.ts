/** Current on-disk/export schema version. */
export const PROJECT_SCHEMA_VERSION = 1 as const;

export type ProjectSchemaVersion = typeof PROJECT_SCHEMA_VERSION;

export type PdfGroupStatus =
  | "empty"
  | "loading"
  | "ready"
  | "missing"
  | "error";

/**
 * Serializable PDF metadata. The actual PDF Blob is deliberately stored in
 * IndexedDB and is referenced only by the opaque `fileKey`.
 */
export interface PdfGroup {
  id: string;
  name: string;
  fileName?: string;
  fileKey?: string;
  fileSize?: number;
  pageCount: number;
  lastViewedPage: number;
  createdAt: string;
  note?: string;
  status: PdfGroupStatus;
  error?: string;
  /** True when metadata exists but the user must select the PDF again. */
  needsFile?: boolean;
}

/** Serializable project metadata persisted in localStorage. */
export interface PdfProject {
  version: ProjectSchemaVersion;
  /** One-time readiness group-name template migration marker. */
  readinessTemplateVersion?: number;
  id: string;
  name: string;
  groups: PdfGroup[];
  selectedGroupId?: string;
  createdAt: string;
  updatedAt: string;
  /**
   * Monotonic counter used for default names. Keeping it in the project avoids
   * reusing a deleted group's number and accidentally creating duplicate names.
   */
  nextGroupNumber: number;
}

/** A group as written to a portable JSON export (never contains a Blob/key). */
export type ExportedPdfGroup = Omit<
  PdfGroup,
  "fileKey" | "status" | "error" | "needsFile"
> & {
  /** Signals that the export carries metadata only, not the source PDF. */
  needsFile?: boolean;
};

/** Portable, schema-versioned project JSON. */
export interface ExportedPdfProject
  extends Omit<PdfProject, "groups" | "selectedGroupId"> {
  format: "pdf-group-manager";
  exportedAt: string;
  groups: ExportedPdfGroup[];
  selectedGroupId?: string;
}

export type ProjectErrorCode =
  | "NOT_HYDRATED"
  | "STORAGE_UNAVAILABLE"
  | "STORAGE_READ_FAILED"
  | "STORAGE_WRITE_FAILED"
  | "PROJECT_INVALID"
  | "PROJECT_VERSION_UNSUPPORTED"
  | "PROJECT_IMPORT_FAILED"
  | "PROJECT_EXPORT_FAILED"
  | "GROUP_NOT_FOUND"
  | "INVALID_GROUP_COUNT"
  | "INVALID_NAME"
  | "INVALID_PAGE_COUNT"
  | "INVALID_PDF"
  | "PDF_NOT_FOUND"
  | "PDF_STORE_FAILED"
  | "PDF_READ_FAILED"
  | "PDF_DELETE_FAILED"
  | "UNKNOWN";

/** Error shape intended to be displayed directly by Mongolian UI. */
export interface ProjectError {
  code: ProjectErrorCode;
  message: string;
  recoverable: boolean;
  groupId?: string;
  details?: string;
}

export interface CreateProjectOptions {
  name?: string;
  groupCount?: number;
  now?: string;
  id?: string;
}

export interface AddGroupsOptions {
  count?: number;
  /** Optional custom names, matched by newly-created group index. */
  names?: readonly (string | undefined)[];
}

export interface UseProjectOptions {
  /** Used only when no saved project exists. Defaults to the 21 named groups. */
  initialGroupCount?: number;
  initialProjectName?: string;
}
