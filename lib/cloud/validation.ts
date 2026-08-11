import "server-only";

import {
  MAX_GROUP_NAME_LENGTH,
  MAX_GROUP_NOTE_LENGTH,
  MAX_GROUPS_PER_PROJECT,
  MAX_PDF_PAGE_COUNT,
  MAX_PDF_SIZE_BYTES,
  MAX_PROJECT_NAME_LENGTH,
} from "@/lib/cloud/constants";
import { CloudApiError } from "@/lib/cloud/errors";
import { assertUuid, assertUuidV4 } from "@/lib/cloud/ids";

type JsonObject = Record<string, unknown>;

export interface CloudGroupInput {
  clientId?: string;
  name: string;
  note: string | null;
  lastViewedPage: number;
}

export interface CreateProjectInput {
  name?: string;
  groups: CloudGroupInput[];
}

export interface UpdateProjectInput {
  name: string;
}

export interface CreateGroupInput {
  clientId?: string;
  name?: string;
  note: string | null;
  lastViewedPage: number;
}

export interface UpdateGroupInput {
  name?: string;
  note?: string | null;
  lastViewedPage?: number;
}

export interface UploadClientPayload {
  projectId: string;
  groupId: string;
  originalName: string;
  pageCount: number;
  fileSize: number;
}

function objectValue(value: unknown, field = "body"): JsonObject {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw validationError(field, "Объект утга байх ёстой.");
  }
  return value as JsonObject;
}

function validationError(field: string, message: string): CloudApiError {
  return new CloudApiError("VALIDATION_ERROR", "Илгээсэн мэдээлэл буруу байна.", 400, {
    fieldErrors: { [field]: message },
  });
}

function allowedKeys(value: JsonObject, allowed: readonly string[], field = "body"): void {
  const unexpected = Object.keys(value).find((key) => !allowed.includes(key));
  if (unexpected) throw validationError(`${field}.${unexpected}`, "Танигдаагүй талбар байна.");
}

function cleanRequiredString(
  value: unknown,
  field: string,
  maxLength: number,
): string {
  if (typeof value !== "string") throw validationError(field, "Текст утга байх ёстой.");
  const normalized = value.normalize("NFC").trim();
  if (!normalized) throw validationError(field, "Хоосон байж болохгүй.");
  if (normalized.length > maxLength) {
    throw validationError(field, `${maxLength} тэмдэгтээс урт байж болохгүй.`);
  }
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(normalized)) {
    throw validationError(field, "Зөвшөөрөгдөөгүй хяналтын тэмдэгт агуулж байна.");
  }
  return normalized;
}

function cleanNote(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") throw validationError(field, "Текст утга байх ёстой.");
  const normalized = value.normalize("NFC");
  if (!normalized.trim()) return null;
  if (normalized.length > MAX_GROUP_NOTE_LENGTH) {
    throw validationError(field, `${MAX_GROUP_NOTE_LENGTH} тэмдэгтээс урт байж болохгүй.`);
  }
  if (normalized.includes("\u0000")) {
    throw validationError(field, "Зөвшөөрөгдөөгүй тэмдэгт агуулж байна.");
  }
  return normalized;
}

function cleanPdfOriginalName(value: unknown): string {
  const name = cleanRequiredString(value, "originalName", 255);
  if (!name.toLocaleLowerCase("en-US").endsWith(".pdf")) {
    throw validationError("originalName", "Файлын нэр .pdf өргөтгөлтэй байх ёстой.");
  }
  if (name.includes("/") || name.includes("\\")) {
    throw validationError("originalName", "Файлын нэр замын тэмдэгт агуулж болохгүй.");
  }
  return name;
}

function pageNumber(value: unknown, field: string, defaultValue = 1): number {
  if (value === undefined) return defaultValue;
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > MAX_PDF_PAGE_COUNT) {
    throw validationError(field, `1-${MAX_PDF_PAGE_COUNT} хооронд бүхэл тоо байна.`);
  }
  return value as number;
}

function groupInput(value: unknown, field: string): CloudGroupInput {
  const object = objectValue(value, field);
  allowedKeys(object, ["clientId", "name", "note", "lastViewedPage"], field);
  return {
    ...(object.clientId === undefined
      ? {}
      : {
          clientId:
            typeof object.clientId === "string"
              ? assertUuidV4(object.clientId, `${field}.clientId`)
              : (() => {
                  throw validationError(`${field}.clientId`, "UUID байх ёстой.");
                })(),
        }),
    name: cleanRequiredString(object.name, `${field}.name`, MAX_GROUP_NAME_LENGTH),
    note: cleanNote(object.note, `${field}.note`),
    lastViewedPage: pageNumber(object.lastViewedPage, `${field}.lastViewedPage`),
  };
}

export function parseCreateProject(value: unknown): CreateProjectInput {
  const object = objectValue(value);
  allowedKeys(object, ["name", "groups"]);
  const groupsValue = object.groups ?? [];
  if (!Array.isArray(groupsValue)) throw validationError("groups", "Жагсаалт байх ёстой.");
  if (groupsValue.length > MAX_GROUPS_PER_PROJECT) {
    throw validationError("groups", `Хамгийн ихдээ ${MAX_GROUPS_PER_PROJECT} бүлэгтэй байна.`);
  }
  const parsedGroups = groupsValue.map((group, index) =>
    groupInput(group, `groups.${index}`),
  );
  const clientIds = parsedGroups.flatMap((group) =>
    group.clientId ? [group.clientId] : [],
  );
  if (new Set(clientIds).size !== clientIds.length) {
    throw validationError("groups", "clientId давхардаж болохгүй.");
  }
  return {
    ...(object.name === undefined
      ? {}
      : { name: cleanRequiredString(object.name, "name", MAX_PROJECT_NAME_LENGTH) }),
    groups: parsedGroups,
  };
}

export function parseUpdateProject(value: unknown): UpdateProjectInput {
  const object = objectValue(value);
  allowedKeys(object, ["name"]);
  return { name: cleanRequiredString(object.name, "name", MAX_PROJECT_NAME_LENGTH) };
}

export function parseCreateGroup(value: unknown): CreateGroupInput {
  const object = objectValue(value);
  allowedKeys(object, ["clientId", "name", "note", "lastViewedPage"]);
  return {
    ...(object.clientId === undefined
      ? {}
      : {
          clientId:
            typeof object.clientId === "string"
              ? assertUuidV4(object.clientId, "clientId")
              : (() => {
                  throw validationError("clientId", "UUID байх ёстой.");
                })(),
        }),
    ...(object.name === undefined
      ? {}
      : { name: cleanRequiredString(object.name, "name", MAX_GROUP_NAME_LENGTH) }),
    note: cleanNote(object.note, "note"),
    lastViewedPage: pageNumber(object.lastViewedPage, "lastViewedPage"),
  };
}

export function parseUpdateGroup(value: unknown): UpdateGroupInput {
  const object = objectValue(value);
  allowedKeys(object, ["name", "note", "lastViewedPage"]);
  if (Object.keys(object).length === 0) throw validationError("body", "Өөрчлөх талбар алга.");
  return {
    ...(object.name === undefined
      ? {}
      : { name: cleanRequiredString(object.name, "name", MAX_GROUP_NAME_LENGTH) }),
    ...(Object.hasOwn(object, "note") ? { note: cleanNote(object.note, "note") } : {}),
    ...(object.lastViewedPage === undefined
      ? {}
      : { lastViewedPage: pageNumber(object.lastViewedPage, "lastViewedPage") }),
  };
}

export function parseReorderGroups(value: unknown): string[] {
  const object = objectValue(value);
  allowedKeys(object, ["groupIds"]);
  if (!Array.isArray(object.groupIds)) throw validationError("groupIds", "Жагсаалт байх ёстой.");
  if (object.groupIds.length > MAX_GROUPS_PER_PROJECT) {
    throw validationError("groupIds", "Бүлгийн жагсаалт хэт урт байна.");
  }
  const ids = object.groupIds.map((id, index) => {
    if (typeof id !== "string") throw validationError(`groupIds.${index}`, "UUID байх ёстой.");
    return assertUuid(id, `groupIds.${index}`);
  });
  if (new Set(ids).size !== ids.length) {
    throw validationError("groupIds", "Давхардсан бүлгийн ID байна.");
  }
  return ids;
}

export function parseUploadClientPayload(value: string | null): UploadClientPayload {
  if (!value || value.length > 2_048) {
    throw validationError("clientPayload", "Upload metadata дутуу эсвэл хэт урт байна.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch (error) {
    throw new CloudApiError("INVALID_JSON", "Upload metadata JSON буруу байна.", 400, {
      cause: error,
    });
  }
  const object = objectValue(parsed, "clientPayload");
  allowedKeys(
    object,
    ["projectId", "groupId", "originalName", "pageCount", "fileSize"],
    "clientPayload",
  );
  if (typeof object.projectId !== "string" || typeof object.groupId !== "string") {
    throw validationError("clientPayload", "Project/group ID дутуу байна.");
  }
  if (object.pageCount === undefined) {
    throw validationError("pageCount", "PDF-ийн хуудасны тоо дутуу байна.");
  }
  if (
    !Number.isSafeInteger(object.fileSize) ||
    Number(object.fileSize) < 1 ||
    Number(object.fileSize) > MAX_PDF_SIZE_BYTES
  ) {
    throw validationError(
      "fileSize",
      `PDF-ийн хэмжээ 1-${MAX_PDF_SIZE_BYTES} byte хооронд бүхэл тоо байх ёстой.`,
    );
  }
  return {
    projectId: assertUuid(object.projectId, "projectId"),
    groupId: assertUuid(object.groupId, "groupId"),
    originalName: cleanPdfOriginalName(object.originalName),
    pageCount: pageNumber(object.pageCount, "pageCount"),
    fileSize: Number(object.fileSize),
  };
}
