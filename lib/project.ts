import {
  PROJECT_SCHEMA_VERSION,
  type AddGroupsOptions,
  type CreateProjectOptions,
  type ExportedPdfGroup,
  type ExportedPdfProject,
  type PdfGroup,
  type PdfGroupStatus,
  type PdfProject,
  type ProjectError,
  type ProjectErrorCode,
} from "@/types/project";

export const DEFAULT_PROJECT_NAME = "Миний PDF төсөл";
export const DEFAULT_DEMO_GROUP_NAMES = [
  "TSCMP-ORP-PGR-001-00_Төслийн засаглал ба үйл ажиллагааны бэлэн байдлын удирдлага",
  "TSCMP-ORP-HRR-002-00_Байгууллагын бэлэн байдал",
  "TSCMP-ORP-MRP-003-00_Уурхайн үйл ажиллагааны бэлэн байдал",
  "TSCMP-ORP-PPR-004-00_Баяжуулах үйлдвэрийн бэлэн байдал",
  "TSCMP-ORP-MRP-005-00_Засвар үйлчилгээний бэлэн байдал",
  "TSCMP-ORP-ARP-006-00_Хөрөнгийн / тоног төхөөрөмжийн бэлэн байдал",
  "TSCMP-ORP-HSR-007-00_ХАБ бэлэн байдал",
  "TSCMP-ORP-ERP-008-00_Байгаль орчны бэлэн байдал",
  "TSCMP-ORP-SCR-009-00_Нийлүүлэлтийн сүлжээний бэлэн байдал",
  "TSCMP-ORP-WRP-010-00_Агуулахын бэлэн байдал",
  "TSCMP-ORP-WRP-011-00_Лабораторийн бэлэн байдал",
  "TSCMP-ORP-IRP-012-00_Дэд бүтэц бэлэн байдал",
  "TSCMP-ORP-TSF-013-00_Хаягдлын аж ахуйн бэлэн байдал",
  "TSCMP-ORP-IRP-014-00_Мэдээллийн технологийн бэлэн байдал",
  "TSCMP-ORP-DRP-015-00_Баримт бичгийн бэлэн байдал",
  "TSCMP-ORP-RRP-016-00_Хууль, зохицуулалтын бэлэн байдал",
  "TSCMP-ORP-OTP-017-00_Үйл ажиллагааны туршилтын үе",
  "TSCMP-ORP-CRP-018-00_Борлуулалтын бэлэн байдал",
  "TSCMP-ORP-BRP-019-00_Бизнесийн үйл ажиллагааны бэлэн байдал",
  "TSCMP-ORP-WRR-020-00_Усны нөөцийн бэлэн байдал",
  "TSCMP-ORP-CSR-021-00_Цаг уур, улирлын нөхцөлд бэлэн байдал",
] as const;
export const DEFAULT_DEMO_GROUP_COUNT = DEFAULT_DEMO_GROUP_NAMES.length;
export const DEFAULT_NEW_PROJECT_GROUP_COUNT = DEFAULT_DEMO_GROUP_COUNT;
export const READINESS_TEMPLATE_VERSION = 1;
export const MAX_GROUP_COUNT = 10_000;

const DEFAULT_GROUP_PREFIX = "Бүлэг";
const GROUP_NUMBER_PATTERN = /^Бүлэг\s+(\d+)$/u;
const PDF_RESELECT_MESSAGE = "PDF файлыг дахин сонгоно уу.";

type UnknownRecord = Record<string, unknown>;

export class ProjectManagerError extends Error {
  readonly code: ProjectErrorCode;
  readonly recoverable: boolean;
  readonly groupId?: string;
  readonly details?: string;

  constructor(
    code: ProjectErrorCode,
    message: string,
    options: {
      recoverable?: boolean;
      groupId?: string;
      details?: string;
      cause?: unknown;
    } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "ProjectManagerError";
    this.code = code;
    this.recoverable = options.recoverable ?? true;
    this.groupId = options.groupId;
    this.details = options.details;
  }
}

export function toProjectError(
  error: unknown,
  fallback: {
    code?: ProjectErrorCode;
    message?: string;
    groupId?: string;
  } = {},
): ProjectError {
  if (error instanceof ProjectManagerError) {
    return {
      code: error.code,
      message: error.message,
      recoverable: error.recoverable,
      ...(error.groupId === undefined ? {} : { groupId: error.groupId }),
      ...(error.details === undefined ? {} : { details: error.details }),
    };
  }

  const details = error instanceof Error ? error.message : undefined;
  return {
    code: fallback.code ?? "UNKNOWN",
    message: fallback.message ?? "Тодорхойгүй алдаа гарлаа.",
    recoverable: true,
    ...(fallback.groupId === undefined ? {} : { groupId: fallback.groupId }),
    ...(details === undefined ? {} : { details }),
  };
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nowIso(): string {
  return new Date().toISOString();
}

function validIsoDate(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw new ProjectManagerError(
      "PROJECT_INVALID",
      `Project-ийн ${fieldName} огноо буруу байна.`,
    );
  }
  return value;
}

function requiredString(
  value: unknown,
  fieldName: string,
  maxLength = 500,
): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ProjectManagerError(
      "PROJECT_INVALID",
      `Project-ийн ${fieldName} утга дутуу байна.`,
    );
  }
  const result = value.trim();
  if (result.length > maxLength) {
    throw new ProjectManagerError(
      "PROJECT_INVALID",
      `Project-ийн ${fieldName} утга хэт урт байна.`,
    );
  }
  return result;
}

function optionalString(
  value: unknown,
  fieldName: string,
  maxLength = 100_000,
): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || value.length > maxLength) {
    throw new ProjectManagerError(
      "PROJECT_INVALID",
      `Project-ийн ${fieldName} утга буруу байна.`,
    );
  }
  return value;
}

function naturalInteger(
  value: unknown,
  fieldName: string,
  minimum = 0,
): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < minimum
  ) {
    throw new ProjectManagerError(
      "PROJECT_INVALID",
      `Project-ийн ${fieldName} тоо буруу байна.`,
    );
  }
  return value;
}

function isGroupStatus(value: unknown): value is PdfGroupStatus {
  return (
    value === "empty" ||
    value === "loading" ||
    value === "ready" ||
    value === "missing" ||
    value === "error"
  );
}

function normalizeGroupName(value: string): string {
  const name = value.trim();
  if (!name) {
    throw new ProjectManagerError("INVALID_NAME", "Бүлгийн нэр хоосон байж болохгүй.");
  }
  if (name.length > 200) {
    throw new ProjectManagerError("INVALID_NAME", "Бүлгийн нэр хэт урт байна.");
  }
  return name;
}

export function createEntityId(prefix: "project" | "group" = "group"): string {
  const randomUuid = globalThis.crypto?.randomUUID?.();
  const randomPart =
    randomUuid ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  return `${prefix}_${randomPart}`;
}

export function validateGroupCount(count: number): number {
  if (!Number.isSafeInteger(count) || count < 0 || count > MAX_GROUP_COUNT) {
    throw new ProjectManagerError(
      "INVALID_GROUP_COUNT",
      `Бүлгийн тоо 0-${MAX_GROUP_COUNT} хооронд бүхэл тоо байх ёстой.`,
    );
  }
  return count;
}

export function makeUniqueName(
  requestedName: string,
  existingNames: Iterable<string>,
): string {
  const base = normalizeGroupName(requestedName);
  const used = new Set(
    Array.from(existingNames, (name) => name.trim().toLocaleLowerCase()),
  );
  if (!used.has(base.toLocaleLowerCase())) return base;

  let suffix = 2;
  while (used.has(`${base} (${suffix})`.toLocaleLowerCase())) suffix += 1;
  return `${base} (${suffix})`;
}

export function createEmptyGroup(
  sequence: number,
  options: { name?: string; now?: string; id?: string } = {},
): PdfGroup {
  if (!Number.isSafeInteger(sequence) || sequence < 1) {
    throw new ProjectManagerError(
      "INVALID_GROUP_COUNT",
      "Бүлгийн дарааллын дугаар буруу байна.",
    );
  }
  const createdAt = options.now ?? nowIso();
  return {
    id: options.id ?? createEntityId("group"),
    name: normalizeGroupName(options.name ?? `${DEFAULT_GROUP_PREFIX} ${sequence}`),
    pageCount: 0,
    lastViewedPage: 1,
    createdAt,
    status: "empty",
  };
}

export function createProject(options: CreateProjectOptions = {}): PdfProject {
  const createdAt = options.now ?? nowIso();
  const useDefaultDemoNames =
    options.groupCount === undefined ||
    options.groupCount === DEFAULT_DEMO_GROUP_COUNT;
  const groupCount = validateGroupCount(
    options.groupCount ?? DEFAULT_DEMO_GROUP_COUNT,
  );
  const groups = Array.from({ length: groupCount }, (_, index) =>
    createEmptyGroup(index + 1, {
      now: createdAt,
      ...(useDefaultDemoNames
        ? { name: DEFAULT_DEMO_GROUP_NAMES[index] }
        : {}),
    }),
  );

  return {
    version: PROJECT_SCHEMA_VERSION,
    readinessTemplateVersion: READINESS_TEMPLATE_VERSION,
    id: options.id ?? createEntityId("project"),
    name: normalizeProjectName(options.name ?? DEFAULT_PROJECT_NAME),
    groups,
    ...(groups[0] === undefined ? {} : { selectedGroupId: groups[0].id }),
    createdAt,
    updatedAt: createdAt,
    nextGroupNumber: groupCount + 1,
  };
}

export function createDemoProject(
  name = DEFAULT_PROJECT_NAME,
): PdfProject {
  return createProject({ name });
}

/**
 * Applies the requested readiness names once to an existing local project.
 * Existing group IDs and all PDF/page/note metadata are retained by position;
 * missing template groups are appended and user-created groups after slot 21
 * are left untouched. The persisted marker lets later manual renames survive.
 */
export function migrateLegacyDemoProject(
  project: PdfProject,
): PdfProject {
  if (
    (project.readinessTemplateVersion ?? 0) >= READINESS_TEMPLATE_VERSION
  ) {
    return project;
  }

  const migratedAt = nowIso();
  const templateGroups = DEFAULT_DEMO_GROUP_NAMES.map((name, index) => {
    const legacyGroup = project.groups[index];
    return legacyGroup
      ? { ...legacyGroup, name }
      : createEmptyGroup(index + 1, { name, now: migratedAt });
  });
  const groups = [...templateGroups, ...project.groups.slice(DEFAULT_DEMO_GROUP_COUNT)];
  const selectedGroupId =
    project.selectedGroupId &&
    groups.some((group) => group.id === project.selectedGroupId)
      ? project.selectedGroupId
      : groups[0]?.id;

  return {
    ...project,
    readinessTemplateVersion: READINESS_TEMPLATE_VERSION,
    groups,
    ...(selectedGroupId === undefined ? {} : { selectedGroupId }),
    updatedAt: migratedAt,
    nextGroupNumber: Math.max(
      project.nextGroupNumber,
      DEFAULT_DEMO_GROUP_COUNT + 1,
    ),
  };
}

export function normalizeProjectName(name: string): string {
  const result = name.trim();
  if (!result) {
    throw new ProjectManagerError("INVALID_NAME", "Төслийн нэр хоосон байж болохгүй.");
  }
  if (result.length > 200) {
    throw new ProjectManagerError("INVALID_NAME", "Төслийн нэр хэт урт байна.");
  }
  return result;
}

function touchProject(
  project: PdfProject,
  changes: Partial<Omit<PdfProject, "version" | "id" | "createdAt">>,
  now = nowIso(),
): PdfProject {
  return { ...project, ...changes, updatedAt: now };
}

function getGroupOrThrow(project: PdfProject, groupId: string): PdfGroup {
  const group = project.groups.find((candidate) => candidate.id === groupId);
  if (!group) {
    throw new ProjectManagerError("GROUP_NOT_FOUND", "Бүлэг олдсонгүй.", {
      groupId,
    });
  }
  return group;
}

function replaceGroup(
  project: PdfProject,
  groupId: string,
  updater: (group: PdfGroup) => PdfGroup,
): PdfProject {
  getGroupOrThrow(project, groupId);
  let changed = false;
  const groups = project.groups.map((group) => {
    if (group.id !== groupId) return group;
    const next = updater(group);
    changed = next !== group;
    return next;
  });
  return changed ? touchProject(project, { groups }) : project;
}

export function selectProjectGroup(
  project: PdfProject,
  groupId: string | undefined,
): PdfProject {
  if (groupId !== undefined) getGroupOrThrow(project, groupId);
  if (project.selectedGroupId === groupId) return project;
  return touchProject(project, { selectedGroupId: groupId });
}

export function renameProject(project: PdfProject, name: string): PdfProject {
  const normalized = normalizeProjectName(name);
  if (project.name === normalized) return project;
  return touchProject(project, { name: normalized });
}

export function renameGroup(
  project: PdfProject,
  groupId: string,
  name: string,
): PdfProject {
  const normalized = normalizeGroupName(name);
  return replaceGroup(project, groupId, (group) =>
    group.name === normalized ? group : { ...group, name: normalized },
  );
}

export function setGroupNote(
  project: PdfProject,
  groupId: string,
  note: string,
): PdfProject {
  // Keep the user's in-progress whitespace intact. Trimming on every controlled
  // input change makes it impossible to type a normal multi-word note because
  // the trailing space disappears before the next character is entered.
  const normalized = note.trim().length > 0 ? note : undefined;
  if (normalized !== undefined && normalized.length > 100_000) {
    throw new ProjectManagerError("PROJECT_INVALID", "Тэмдэглэл хэт урт байна.", {
      groupId,
    });
  }
  return replaceGroup(project, groupId, (group) =>
    group.note === normalized ? group : { ...group, note: normalized },
  );
}

export function addGroups(
  project: PdfProject,
  options: number | AddGroupsOptions = 1,
): PdfProject {
  const normalizedOptions = typeof options === "number" ? { count: options } : options;
  const count = validateGroupCount(normalizedOptions.count ?? 1);
  if (project.groups.length + count > MAX_GROUP_COUNT) {
    throw new ProjectManagerError(
      "INVALID_GROUP_COUNT",
      `Нийт бүлгийн тоо ${MAX_GROUP_COUNT}-аас их байж болохгүй.`,
    );
  }
  if (count === 0) return project;

  let sequence = Math.max(1, project.nextGroupNumber);
  const names = new Set(project.groups.map((group) => group.name));
  const normalizedNames = new Set(
    project.groups.map((group) => group.name.trim().toLocaleLowerCase()),
  );
  const newGroups: PdfGroup[] = [];
  const createdAt = nowIso();

  for (let index = 0; index < count; index += 1) {
    if (sequence >= Number.MAX_SAFE_INTEGER) {
      throw new ProjectManagerError(
        "INVALID_GROUP_COUNT",
        "Бүлгийн дарааллын дугаар хэт их байна.",
      );
    }
    let defaultName = `${DEFAULT_GROUP_PREFIX} ${sequence}`;
    while (normalizedNames.has(defaultName.toLocaleLowerCase())) {
      if (sequence >= Number.MAX_SAFE_INTEGER - 1) {
        throw new ProjectManagerError(
          "INVALID_GROUP_COUNT",
          "Бүлгийн дарааллын дугаар хэт их байна.",
        );
      }
      sequence += 1;
      defaultName = `${DEFAULT_GROUP_PREFIX} ${sequence}`;
    }
    const requestedName = normalizedOptions.names?.[index];
    const name =
      requestedName === undefined || requestedName.trim() === ""
        ? defaultName
        : makeUniqueName(requestedName, names);
    const group = createEmptyGroup(sequence, { name, now: createdAt });
    newGroups.push(group);
    names.add(group.name);
    normalizedNames.add(group.name.trim().toLocaleLowerCase());
    sequence += 1;
  }

  const groups = [...project.groups, ...newGroups];
  return touchProject(project, {
    groups,
    selectedGroupId: project.selectedGroupId ?? newGroups[0]?.id,
    nextGroupNumber: sequence,
  });
}

export function attachPdfMetadata(
  project: PdfProject,
  groupId: string,
  file: { name: string; size: number },
  pageCount: number,
  fileKey: string,
): PdfProject {
  if (!Number.isSafeInteger(pageCount) || pageCount < 1) {
    throw new ProjectManagerError(
      "INVALID_PAGE_COUNT",
      "PDF-ийн хуудасны тоо буруу байна.",
      { groupId },
    );
  }
  if (!file.name.trim() || !Number.isFinite(file.size) || file.size < 0) {
    throw new ProjectManagerError("INVALID_PDF", "PDF файлын мэдээлэл буруу байна.", {
      groupId,
    });
  }
  if (!fileKey) {
    throw new ProjectManagerError("PDF_STORE_FAILED", "PDF файлыг хадгалж чадсангүй.", {
      groupId,
    });
  }

  return replaceGroup(project, groupId, (group) => ({
    ...group,
    fileName: file.name,
    fileKey,
    fileSize: file.size,
    pageCount,
    lastViewedPage: Math.min(Math.max(group.lastViewedPage, 1), pageCount),
    status: "ready",
    error: undefined,
    needsFile: undefined,
  }));
}

export function removePdfMetadata(
  project: PdfProject,
  groupId: string,
): PdfProject {
  return replaceGroup(project, groupId, (group) => ({
    id: group.id,
    name: group.name,
    pageCount: 0,
    lastViewedPage: 1,
    createdAt: group.createdAt,
    ...(group.note === undefined ? {} : { note: group.note }),
    status: "empty",
  }));
}

export function markPdfMissing(
  project: PdfProject,
  groupId: string,
  message = PDF_RESELECT_MESSAGE,
): PdfProject {
  return replaceGroup(project, groupId, (group) => {
    if (!group.fileName) return group;
    return {
      ...group,
      fileKey: undefined,
      status: "missing",
      error: message,
      needsFile: true,
    };
  });
}

export function setGroupStatus(
  project: PdfProject,
  groupId: string,
  status: PdfGroupStatus,
  error?: string,
): PdfProject {
  return replaceGroup(project, groupId, (group) => {
    const nextError = error?.trim() || undefined;
    const needsFile = status === "missing" ? true : group.needsFile;
    if (
      group.status === status &&
      group.error === nextError &&
      group.needsFile === needsFile
    ) {
      return group;
    }
    return {
      ...group,
      status,
      error: nextError,
      ...(needsFile === undefined ? {} : { needsFile }),
    };
  });
}

export interface DuplicateGroupMetadataOptions {
  id?: string;
  fileKey?: string;
  now?: string;
  select?: boolean;
}

export function duplicateGroupMetadata(
  project: PdfProject,
  groupId: string,
  options: DuplicateGroupMetadataOptions = {},
): PdfProject {
  if (project.groups.length >= MAX_GROUP_COUNT) {
    throw new ProjectManagerError(
      "INVALID_GROUP_COUNT",
      `Нийт бүлгийн тоо ${MAX_GROUP_COUNT}-аас их байж болохгүй.`,
    );
  }
  const sourceIndex = project.groups.findIndex((group) => group.id === groupId);
  if (sourceIndex < 0) getGroupOrThrow(project, groupId);
  const source = project.groups[sourceIndex];
  if (!source) return project;

  const hasCopiedBlob = source.fileName !== undefined && options.fileKey !== undefined;
  const duplicate: PdfGroup = {
    ...source,
    id: options.id ?? createEntityId("group"),
    name: makeUniqueName(`${source.name} хуулбар`, project.groups.map((group) => group.name)),
    createdAt: options.now ?? nowIso(),
    ...(hasCopiedBlob ? { fileKey: options.fileKey } : { fileKey: undefined }),
    status:
      source.fileName === undefined ? "empty" : hasCopiedBlob ? "ready" : "missing",
    error:
      source.fileName !== undefined && !hasCopiedBlob
        ? PDF_RESELECT_MESSAGE
        : undefined,
    needsFile:
      source.fileName !== undefined && !hasCopiedBlob ? true : undefined,
  };
  const groups = [...project.groups];
  groups.splice(sourceIndex + 1, 0, duplicate);
  return touchProject(project, {
    groups,
    selectedGroupId: options.select === false ? project.selectedGroupId : duplicate.id,
  });
}

export function deleteProjectGroup(
  project: PdfProject,
  groupId: string,
): PdfProject {
  const deletedIndex = project.groups.findIndex((group) => group.id === groupId);
  if (deletedIndex < 0) getGroupOrThrow(project, groupId);
  const groups = project.groups.filter((group) => group.id !== groupId);
  let selectedGroupId = project.selectedGroupId;
  if (selectedGroupId === groupId) {
    selectedGroupId = groups[deletedIndex]?.id ?? groups[deletedIndex - 1]?.id;
  }
  return touchProject(project, { groups, selectedGroupId });
}

export function reorderProjectGroups(
  project: PdfProject,
  activeId: string,
  overId: string,
): PdfProject {
  if (activeId === overId) return project;
  const fromIndex = project.groups.findIndex((group) => group.id === activeId);
  const toIndex = project.groups.findIndex((group) => group.id === overId);
  if (fromIndex < 0) getGroupOrThrow(project, activeId);
  if (toIndex < 0) getGroupOrThrow(project, overId);
  const groups = [...project.groups];
  const [moved] = groups.splice(fromIndex, 1);
  if (!moved) return project;
  groups.splice(toIndex, 0, moved);
  return touchProject(project, { groups });
}

export function setLastViewedPage(
  project: PdfProject,
  groupId: string,
  page: number,
): PdfProject {
  if (!Number.isSafeInteger(page) || page < 1) {
    throw new ProjectManagerError(
      "INVALID_PAGE_COUNT",
      "Хуудасны дугаар буруу байна.",
      { groupId },
    );
  }
  return replaceGroup(project, groupId, (group) => {
    const lastViewedPage = group.pageCount > 0 ? Math.min(page, group.pageCount) : 1;
    return group.lastViewedPage === lastViewedPage
      ? group
      : { ...group, lastViewedPage };
  });
}

function validatePdfGroup(
  value: unknown,
  options: { stripFileKeys: boolean },
): PdfGroup {
  if (!isRecord(value)) {
    throw new ProjectManagerError("PROJECT_INVALID", "Project доторх бүлэг буруу байна.");
  }

  const id = requiredString(value.id, "бүлгийн ID", 300);
  const name = requiredString(value.name, "бүлгийн нэр", 200);
  const createdAt = validIsoDate(value.createdAt, "бүлгийн createdAt");
  const fileName = optionalString(value.fileName, "файлын нэр", 2_000);
  const note = optionalString(value.note, "тэмдэглэл");
  const error = optionalString(value.error, "алдааны тайлбар", 5_000);
  const pageCount = naturalInteger(value.pageCount, "хуудасны тоо");
  const rawLastViewedPage = naturalInteger(value.lastViewedPage, "сүүлд үзсэн хуудас", 1);
  const lastViewedPage = pageCount > 0 ? Math.min(rawLastViewedPage, pageCount) : 1;
  const fileSize =
    value.fileSize === undefined
      ? undefined
      : naturalInteger(value.fileSize, "файлын хэмжээ");
  const rawFileKey = optionalString(value.fileKey, "файлын түлхүүр", 1_000);
  const fileKey = options.stripFileKeys ? undefined : rawFileKey;

  if (!fileName) {
    return {
      id,
      name,
      pageCount: 0,
      lastViewedPage: 1,
      createdAt,
      ...(note === undefined ? {} : { note }),
      status: "empty",
    };
  }

  const storedStatus = isGroupStatus(value.status) ? value.status : undefined;
  const status: PdfGroupStatus = fileKey
    ? storedStatus === "error"
      ? "error"
      : "ready"
    : "missing";

  return {
    id,
    name,
    fileName,
    ...(fileKey === undefined ? {} : { fileKey }),
    ...(fileSize === undefined ? {} : { fileSize }),
    pageCount,
    lastViewedPage,
    createdAt,
    ...(note === undefined ? {} : { note }),
    status,
    ...(status === "error" && error !== undefined ? { error } : {}),
    ...(fileKey === undefined
      ? { needsFile: true, error: PDF_RESELECT_MESSAGE }
      : {}),
  };
}

function highestDefaultGroupNumber(groups: readonly PdfGroup[]): number {
  return groups.reduce((highest, group) => {
    const match = GROUP_NUMBER_PATTERN.exec(group.name.trim());
    if (!match?.[1]) return highest;
    const number = Number(match[1]);
    return Number.isSafeInteger(number) ? Math.max(highest, number) : highest;
  }, 0);
}

export interface ValidateProjectOptions {
  /** Portable imports must never trust an IndexedDB key from another context. */
  stripFileKeys?: boolean;
}

export function validateProject(
  value: unknown,
  options: ValidateProjectOptions = {},
): PdfProject {
  if (!isRecord(value)) {
    throw new ProjectManagerError("PROJECT_INVALID", "Project JSON бүтэц буруу байна.");
  }
  if (value.version !== PROJECT_SCHEMA_VERSION) {
    throw new ProjectManagerError(
      "PROJECT_VERSION_UNSUPPORTED",
      "Project-ийн хувилбар дэмжигдэхгүй байна.",
      { recoverable: false },
    );
  }
  if (!Array.isArray(value.groups)) {
    throw new ProjectManagerError("PROJECT_INVALID", "Project-ийн бүлгүүд буруу байна.");
  }
  if (value.groups.length > MAX_GROUP_COUNT) {
    throw new ProjectManagerError(
      "PROJECT_INVALID",
      `Project ${MAX_GROUP_COUNT}-аас олон бүлэгтэй байна.`,
    );
  }

  const groups = value.groups.map((group) =>
    validatePdfGroup(group, { stripFileKeys: options.stripFileKeys ?? false }),
  );
  const ids = new Set<string>();
  for (const group of groups) {
    if (ids.has(group.id)) {
      throw new ProjectManagerError(
        "PROJECT_INVALID",
        "Project-д давхардсан бүлгийн ID байна.",
      );
    }
    ids.add(group.id);
  }

  const selectedCandidate = optionalString(
    value.selectedGroupId,
    "сонгосон бүлгийн ID",
    300,
  );
  const selectedGroupId =
    selectedCandidate !== undefined && ids.has(selectedCandidate)
      ? selectedCandidate
      : groups[0]?.id;
  const highestDefault = highestDefaultGroupNumber(groups);
  if (highestDefault >= Number.MAX_SAFE_INTEGER) {
    throw new ProjectManagerError(
      "PROJECT_INVALID",
      "Project-ийн бүлгийн дарааллын дугаар хэт их байна.",
    );
  }
  const derivedNext = highestDefault + 1;
  const storedNext =
    value.nextGroupNumber === undefined
      ? derivedNext
      : naturalInteger(value.nextGroupNumber, "дараагийн бүлгийн дугаар", 1);
  const readinessTemplateVersion =
    value.readinessTemplateVersion === undefined
      ? undefined
      : naturalInteger(
          value.readinessTemplateVersion,
          "бэлэн байдлын загварын хувилбар",
          1,
        );

  return {
    version: PROJECT_SCHEMA_VERSION,
    ...(readinessTemplateVersion === undefined
      ? {}
      : { readinessTemplateVersion }),
    id: requiredString(value.id, "ID", 300),
    name: requiredString(value.name, "нэр", 200),
    groups,
    ...(selectedGroupId === undefined ? {} : { selectedGroupId }),
    createdAt: validIsoDate(value.createdAt, "createdAt"),
    updatedAt: validIsoDate(value.updatedAt, "updatedAt"),
    nextGroupNumber: Math.max(storedNext, derivedNext, 1),
  };
}

export function parseProjectJson(json: string): PdfProject {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json) as unknown;
  } catch (error) {
    throw new ProjectManagerError(
      "PROJECT_IMPORT_FAILED",
      "Project JSON файлыг уншиж чадсангүй.",
      { cause: error },
    );
  }
  return validateProject(parsed, { stripFileKeys: true });
}

export function importProjectData(value: unknown): PdfProject {
  return typeof value === "string"
    ? parseProjectJson(value)
    : validateProject(value, { stripFileKeys: true });
}

export function toExportProject(
  project: PdfProject,
  exportedAt = nowIso(),
): ExportedPdfProject {
  const groups: ExportedPdfGroup[] = project.groups.map((group) => ({
    id: group.id,
    name: group.name,
    ...(group.fileName === undefined ? {} : { fileName: group.fileName }),
    ...(group.fileSize === undefined ? {} : { fileSize: group.fileSize }),
    pageCount: group.pageCount,
    lastViewedPage: group.lastViewedPage,
    createdAt: group.createdAt,
    ...(group.note === undefined ? {} : { note: group.note }),
    ...(group.fileName === undefined ? {} : { needsFile: true }),
  }));

  return {
    format: "pdf-group-manager",
    version: PROJECT_SCHEMA_VERSION,
    ...(project.readinessTemplateVersion === undefined
      ? {}
      : { readinessTemplateVersion: project.readinessTemplateVersion }),
    id: project.id,
    name: project.name,
    groups,
    ...(project.selectedGroupId === undefined
      ? {}
      : { selectedGroupId: project.selectedGroupId }),
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    nextGroupNumber: project.nextGroupNumber,
    exportedAt,
  };
}

export function serializeProject(project: PdfProject): string {
  try {
    return JSON.stringify(toExportProject(project), null, 2);
  } catch (error) {
    throw new ProjectManagerError(
      "PROJECT_EXPORT_FAILED",
      "Project хадгалах үед алдаа гарлаа.",
      { cause: error },
    );
  }
}

export function getProjectExportFileName(projectName: string): string {
  const safeName = projectName
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]/gu, "-")
    .replace(/\s+/gu, " ")
    .slice(0, 120)
    .trim();
  return `${safeName || "project"}.pdfgroup.json`;
}

export function downloadProjectJson(
  project: PdfProject,
  fileName = getProjectExportFileName(project.name),
): void {
  if (typeof document === "undefined" || typeof URL === "undefined") {
    throw new ProjectManagerError(
      "PROJECT_EXPORT_FAILED",
      "Project татах үйлдэл зөвхөн browser дээр ажиллана.",
    );
  }
  const blob = new Blob([serializeProject(project)], {
    type: "application/json;charset=utf-8",
  });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = fileName;
  anchor.hidden = true;
  document.body.append(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
  }
}

export const projectMessages = {
  pdfReselect: PDF_RESELECT_MESSAGE,
} as const;
