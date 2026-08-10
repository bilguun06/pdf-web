import { openDB, type DBSchema, type IDBPDatabase } from "idb";

import { ProjectManagerError, createEntityId } from "@/lib/project";
import type { PdfProject } from "@/types/project";

export const PROJECT_LOCAL_STORAGE_KEY = "pdf-group-manager:project:v1";
export const PDF_DATABASE_NAME = "pdf-group-manager";
export const PDF_DATABASE_VERSION = 1;
export const PDF_BLOB_STORE = "pdf-blobs" as const;

export interface PdfBlobRecord {
  key: string;
  projectId: string;
  groupId: string;
  fileName: string;
  mimeType: string;
  size: number;
  createdAt: string;
  blob: Blob;
}

interface PdfGroupManagerDatabase extends DBSchema {
  "pdf-blobs": {
    key: string;
    value: PdfBlobRecord;
    indexes: {
      "by-project": string;
      "by-project-group": [string, string];
    };
  };
}

export interface StorePdfBlobOptions {
  projectId: string;
  groupId: string;
  fileName: string;
  blob: Blob;
  /** When supplied, replacement and old-record removal share one transaction. */
  replaceKey?: string;
}

let databasePromise: Promise<IDBPDatabase<PdfGroupManagerDatabase>> | undefined;

function errorDetails(error: unknown): string | undefined {
  return error instanceof Error ? error.message : undefined;
}

const STORAGE_QUOTA_MESSAGE =
  "Хөтчийн хадгалах зай хүрэлцэхгүй байна. Хэрэггүй PDF файлуудаа устгаад дахин оролдоно уу.";

/** Recognize the quota errors used by Chromium, Firefox and WebKit storage. */
function isStorageQuotaError(
  error: unknown,
  seen = new Set<unknown>(),
): boolean {
  if (typeof error !== "object" || error === null || seen.has(error)) {
    return false;
  }
  seen.add(error);

  const record = error as {
    name?: unknown;
    code?: unknown;
    message?: unknown;
    cause?: unknown;
  };
  const name = typeof record.name === "string" ? record.name : "";
  const code = typeof record.code === "number" ? record.code : undefined;
  const message =
    typeof record.message === "string" ? record.message.toLocaleLowerCase() : "";

  if (
    name === "QuotaExceededError" ||
    name === "NS_ERROR_DOM_QUOTA_REACHED" ||
    code === 22 ||
    code === 1014 ||
    message.includes("quota exceeded") ||
    message.includes("storage quota") ||
    message.includes("disk is full") ||
    message.includes("not enough space")
  ) {
    return true;
  }

  return isStorageQuotaError(record.cause, seen);
}

function quotaError(
  error: unknown,
  code: "STORAGE_WRITE_FAILED" | "PDF_STORE_FAILED",
  groupId?: string,
): ProjectManagerError {
  return new ProjectManagerError(code, STORAGE_QUOTA_MESSAGE, {
    groupId,
    cause: error,
    details: errorDetails(error),
  });
}

function requireLocalStorage(): Storage {
  if (typeof window === "undefined") {
    throw new ProjectManagerError(
      "STORAGE_UNAVAILABLE",
      "Дотоод хадгалалт зөвхөн хөтөч дээр ажиллана.",
      { recoverable: false },
    );
  }
  try {
    return window.localStorage;
  } catch (error) {
    throw new ProjectManagerError(
      "STORAGE_UNAVAILABLE",
      "Хөтчийн төслийн хадгалалтыг ашиглах боломжгүй байна.",
      { cause: error, details: errorDetails(error) },
    );
  }
}

function requireIndexedDb(): IDBFactory {
  if (typeof indexedDB === "undefined") {
    throw new ProjectManagerError(
      "STORAGE_UNAVAILABLE",
      "Хөтчийн PDF хадгалалтыг ашиглах боломжгүй байна.",
      { recoverable: false },
    );
  }
  return indexedDB;
}

function validIdentifier(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > 500) {
    throw new ProjectManagerError(
      "STORAGE_WRITE_FAILED",
      `${label} хадгалах түлхүүр буруу байна.`,
    );
  }
  return normalized;
}

function validBlobKey(key: string): string {
  const normalized = key.trim();
  if (!normalized || normalized.length > 1_000) {
    throw new ProjectManagerError(
      "PDF_READ_FAILED",
      "PDF файлын хадгалалтын түлхүүр буруу байна.",
    );
  }
  return normalized;
}

async function getDatabase(): Promise<IDBPDatabase<PdfGroupManagerDatabase>> {
  requireIndexedDb();
  if (!databasePromise) {
    databasePromise = openDB<PdfGroupManagerDatabase>(
      PDF_DATABASE_NAME,
      PDF_DATABASE_VERSION,
      {
        upgrade(database) {
          if (!database.objectStoreNames.contains(PDF_BLOB_STORE)) {
            const store = database.createObjectStore(PDF_BLOB_STORE, {
              keyPath: "key",
            });
            store.createIndex("by-project", "projectId");
            store.createIndex("by-project-group", ["projectId", "groupId"]);
          }
        },
        blocking() {
          databasePromise?.then((database) => database.close()).catch(() => undefined);
          databasePromise = undefined;
        },
        terminated() {
          databasePromise = undefined;
        },
      },
    ).catch((error: unknown) => {
      databasePromise = undefined;
      throw new ProjectManagerError(
        "STORAGE_UNAVAILABLE",
        "PDF хадгалалтын санг нээж чадсангүй.",
        { cause: error, details: errorDetails(error) },
      );
    });
  }
  return databasePromise;
}

/** Read and parse metadata. Schema validation intentionally lives in lib/project. */
export function loadProjectMetadata(): unknown | null {
  let serialized: string | null;
  try {
    serialized = requireLocalStorage().getItem(PROJECT_LOCAL_STORAGE_KEY);
  } catch (error) {
    if (error instanceof ProjectManagerError) throw error;
    throw new ProjectManagerError(
      "STORAGE_READ_FAILED",
      "Хадгалсан төслийг уншиж чадсангүй.",
      { cause: error, details: errorDetails(error) },
    );
  }
  if (serialized === null) return null;
  try {
    return JSON.parse(serialized) as unknown;
  } catch (error) {
    throw new ProjectManagerError(
      "STORAGE_READ_FAILED",
      "Хадгалсан төслийн JSON гэмтсэн байна.",
      { cause: error, details: errorDetails(error) },
    );
  }
}

/** Persist serializable metadata only; PdfProject never includes the PDF Blob. */
export function saveProjectMetadata(project: PdfProject): void {
  try {
    requireLocalStorage().setItem(PROJECT_LOCAL_STORAGE_KEY, JSON.stringify(project));
  } catch (error) {
    if (error instanceof ProjectManagerError) throw error;
    if (isStorageQuotaError(error)) {
      throw quotaError(error, "STORAGE_WRITE_FAILED");
    }
    throw new ProjectManagerError(
      "STORAGE_WRITE_FAILED",
      "Төслийг хадгалах үед алдаа гарлаа.",
      { cause: error, details: errorDetails(error) },
    );
  }
}

export function clearProjectMetadata(): void {
  try {
    requireLocalStorage().removeItem(PROJECT_LOCAL_STORAGE_KEY);
  } catch (error) {
    if (error instanceof ProjectManagerError) throw error;
    throw new ProjectManagerError(
      "STORAGE_WRITE_FAILED",
      "Төслийн хадгалсан мэдээллийг цэвэрлэж чадсангүй.",
      { cause: error, details: errorDetails(error) },
    );
  }
}

export function createPdfBlobKey(): string {
  // The key is opaque and contains no file name/path supplied by the user.
  return `pdf_${createEntityId("group")}`;
}

export async function storePdfBlob(
  options: StorePdfBlobOptions,
): Promise<string> {
  const projectId = validIdentifier(options.projectId, "Project-ийн ID");
  const groupId = validIdentifier(options.groupId, "Бүлгийн ID");
  const fileName = options.fileName.trim();
  if (!fileName) {
    throw new ProjectManagerError("INVALID_PDF", "PDF файлын нэр буруу байна.", {
      groupId,
    });
  }
  if (!Number.isFinite(options.blob.size) || options.blob.size < 0) {
    throw new ProjectManagerError("INVALID_PDF", "PDF файлын хэмжээ буруу байна.", {
      groupId,
    });
  }

  const key = createPdfBlobKey();
  const record: PdfBlobRecord = {
    key,
    projectId,
    groupId,
    fileName,
    mimeType: options.blob.type || "application/pdf",
    size: options.blob.size,
    createdAt: new Date().toISOString(),
    blob: options.blob,
  };

  try {
    const database = await getDatabase();
    const transaction = database.transaction(PDF_BLOB_STORE, "readwrite");
    try {
      await transaction.store.put(record);
      if (options.replaceKey && options.replaceKey !== key) {
        await transaction.store.delete(validBlobKey(options.replaceKey));
      }
      await transaction.done;
    } catch (error) {
      if (isStorageQuotaError(error) || isStorageQuotaError(transaction.error)) {
        throw quotaError(error, "PDF_STORE_FAILED", groupId);
      }
      throw transaction.error ?? error;
    }
    return key;
  } catch (error) {
    if (error instanceof ProjectManagerError) throw error;
    if (isStorageQuotaError(error)) {
      throw quotaError(error, "PDF_STORE_FAILED", groupId);
    }
    throw new ProjectManagerError(
      "PDF_STORE_FAILED",
      "PDF файлыг browser-д хадгалж чадсангүй.",
      { groupId, cause: error, details: errorDetails(error) },
    );
  }
}

export async function getPdfBlobRecord(
  key: string,
): Promise<PdfBlobRecord | null> {
  try {
    const record = await (await getDatabase()).get(PDF_BLOB_STORE, validBlobKey(key));
    return record ?? null;
  } catch (error) {
    if (error instanceof ProjectManagerError) throw error;
    throw new ProjectManagerError(
      "PDF_READ_FAILED",
      "PDF файлыг хадгалалтаас уншиж чадсангүй.",
      { cause: error, details: errorDetails(error) },
    );
  }
}

export async function getStoredPdfBlob(key: string): Promise<Blob | null> {
  return (await getPdfBlobRecord(key))?.blob ?? null;
}

export async function hasPdfBlob(key: string): Promise<boolean> {
  return (await getPdfBlobRecord(key)) !== null;
}

export async function copyPdfBlob(
  sourceKey: string,
  options: Omit<StorePdfBlobOptions, "blob" | "replaceKey">,
): Promise<string> {
  const source = await getPdfBlobRecord(sourceKey);
  if (!source) {
    throw new ProjectManagerError("PDF_NOT_FOUND", "PDF файл хадгалалтаас олдсонгүй.", {
      groupId: options.groupId,
    });
  }
  // slice() produces a distinct Blob object and the new key is a distinct DB record.
  const copy = source.blob.slice(0, source.blob.size, source.mimeType);
  return storePdfBlob({ ...options, blob: copy });
}

export async function deletePdfBlob(key: string): Promise<void> {
  try {
    await (await getDatabase()).delete(PDF_BLOB_STORE, validBlobKey(key));
  } catch (error) {
    if (error instanceof ProjectManagerError) throw error;
    throw new ProjectManagerError(
      "PDF_DELETE_FAILED",
      "PDF файлыг хадгалалтаас устгаж чадсангүй.",
      { cause: error, details: errorDetails(error) },
    );
  }
}

export async function deleteGroupPdfBlobs(
  projectId: string,
  groupId: string,
): Promise<void> {
  const normalizedProjectId = validIdentifier(projectId, "Project-ийн ID");
  const normalizedGroupId = validIdentifier(groupId, "Бүлгийн ID");
  try {
    const database = await getDatabase();
    const transaction = database.transaction(PDF_BLOB_STORE, "readwrite");
    const index = transaction.store.index("by-project-group");
    let cursor = await index.openKeyCursor(
      IDBKeyRange.only([normalizedProjectId, normalizedGroupId]),
    );
    while (cursor) {
      await transaction.store.delete(cursor.primaryKey);
      cursor = await cursor.continue();
    }
    await transaction.done;
  } catch (error) {
    if (error instanceof ProjectManagerError) throw error;
    throw new ProjectManagerError(
      "PDF_DELETE_FAILED",
      "Бүлгийн PDF файлыг хадгалалтаас устгаж чадсангүй.",
      { groupId, cause: error, details: errorDetails(error) },
    );
  }
}

export async function deleteProjectPdfBlobs(projectId: string): Promise<void> {
  const normalizedProjectId = validIdentifier(projectId, "Project-ийн ID");
  try {
    const database = await getDatabase();
    const transaction = database.transaction(PDF_BLOB_STORE, "readwrite");
    const index = transaction.store.index("by-project");
    let cursor = await index.openKeyCursor(IDBKeyRange.only(normalizedProjectId));
    while (cursor) {
      await transaction.store.delete(cursor.primaryKey);
      cursor = await cursor.continue();
    }
    await transaction.done;
  } catch (error) {
    if (error instanceof ProjectManagerError) throw error;
    throw new ProjectManagerError(
      "PDF_DELETE_FAILED",
      "Project-ийн PDF файлуудыг хадгалалтаас цэвэрлэж чадсангүй.",
      { cause: error, details: errorDetails(error) },
    );
  }
}

/**
 * Remove crash leftovers and records from projects that are no longer active.
 * A record is retained only when the current metadata references the same key,
 * project and group. Call this only after the metadata has been durably saved.
 */
export async function prunePdfBlobStorage(project: PdfProject): Promise<void> {
  const expected = new Map(
    project.groups.flatMap((group) =>
      group.fileKey ? [[group.fileKey, group.id] as const] : [],
    ),
  );

  try {
    const database = await getDatabase();
    const transaction = database.transaction(PDF_BLOB_STORE, "readwrite");
    let cursor = await transaction.store.openCursor();
    while (cursor) {
      const record = cursor.value;
      if (
        record.projectId !== project.id ||
        expected.get(record.key) !== record.groupId
      ) {
        await cursor.delete();
      }
      cursor = await cursor.continue();
    }
    await transaction.done;
  } catch (error) {
    if (error instanceof ProjectManagerError) throw error;
    throw new ProjectManagerError(
      "PDF_DELETE_FAILED",
      "Ашиглагдахгүй PDF хадгалалтыг цэвэрлэж чадсангүй.",
      { cause: error, details: errorDetails(error) },
    );
  }
}

/** Mostly useful for tests/HMR; the next operation opens a fresh connection. */
export async function closePdfDatabase(): Promise<void> {
  const pending = databasePromise;
  databasePromise = undefined;
  if (pending) (await pending).close();
}

export const persistProjectMetadata = saveProjectMetadata;
export const readProjectMetadata = loadProjectMetadata;
