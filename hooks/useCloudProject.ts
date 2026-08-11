"use client";

import { upload } from "@vercel/blob/client";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type { PdfGroup, PdfProject } from "@/types/project";

const CLOUD_BINDING_VERSION = 1 as const;
const CLOUD_BINDING_PREFIX = "pdf-group-manager:cloud-binding:v1:";
const PENDING_CREATE_VERSION = 1 as const;
const PENDING_CREATE_PREFIX = "pdf-group-manager:cloud-create:v1:";
const EDITOR_TOKEN_PREFIX = "pdf-group-manager:cloud-editor-token:v1:";
const MULTIPART_THRESHOLD_BYTES = 100 * 1024 * 1024;
const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CALLBACK_POLL_DELAYS_MS = [
  250, 500, 750, 1_000, 1_500, 2_000, 2_500, 3_000, 3_500, 4_000, 4_500, 5_000,
] as const;

type UnknownRecord = Record<string, unknown>;

export interface CloudPdfFile {
  id: string;
  originalName: string;
  blobUrl: string;
  pageCount: number;
  fileSize: number;
  createdAt: string;
  updatedAt: string;
}

export interface CloudGroup {
  id: string;
  clientId: string | null;
  name: string;
  sortOrder: number;
  note: string | null;
  lastViewedPage: number;
  createdAt: string;
  updatedAt: string;
  pdf: CloudPdfFile | null;
}

export interface CloudProject {
  id: string;
  shareId: string;
  name: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  groups: CloudGroup[];
}

export interface CloudBinding {
  version: typeof CLOUD_BINDING_VERSION;
  localProjectId: string;
  localProjectCreatedAt: string;
  projectId: string;
  shareId: string;
  editToken: string;
  shareUrl: string;
  editorUrl: string;
  groupMap: Record<string, string>;
  clientGroupIds: Record<string, string>;
  uploadedFileKeys: Record<string, string>;
  lastSyncedAt?: string;
}

interface PendingCloudCreate {
  version: typeof PENDING_CREATE_VERSION;
  localProjectId: string;
  localProjectCreatedAt: string;
  idempotencyKey: string;
  requestBody: string;
  groups: Array<{
    localGroupId: string;
    clientId: string;
  }>;
}

const pendingCreateMemory = new Map<string, PendingCloudCreate>();

export type CloudSyncPhase =
  | "idle"
  | "creating"
  | "syncing-metadata"
  | "reading-files"
  | "uploading"
  | "verifying"
  | "complete"
  | "error";

export interface CloudSyncProgress {
  phase: CloudSyncPhase;
  percent: number;
  message: string;
  currentFile?: string;
  completedFiles: number;
  totalFiles: number;
}

export class CloudProjectError extends Error {
  readonly status?: number;
  readonly code?: string;

  constructor(message: string, options: { status?: number; code?: string; cause?: unknown } = {}) {
    super(message, { cause: options.cause });
    this.name = "CloudProjectError";
    this.status = options.status;
    this.code = options.code;
  }
}

interface CloudMigrationOptions {
  project: PdfProject;
  getPdfBlob: (groupId: string) => Promise<Blob | null>;
}

interface CreateProjectResponse {
  project: CloudProject;
  editToken: string;
  editorUrl: string;
  shareUrl: string;
}

interface CloudApiErrorPayload {
  error?: {
    code?: unknown;
    message?: unknown;
  };
}

interface UploadExpectation {
  groupId: string;
  blobUrl: string;
  originalName: string;
  fileSize: number;
  pageCount: number;
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new CloudProjectError(`${label} буруу байна.`);
  }
  return value;
}

function finiteInteger(value: unknown, fallback = 0): number {
  return Number.isSafeInteger(value) ? Number(value) : fallback;
}

function nullableUuid(value: unknown, label: string): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string" || !UUID_V4_PATTERN.test(value)) {
    throw new CloudProjectError(`${label} буруу байна.`);
  }
  return value;
}

function normalizePdf(value: unknown): CloudPdfFile | null {
  if (value === null || value === undefined) return null;
  if (!isRecord(value)) throw new CloudProjectError("Cloud PDF мэдээлэл буруу байна.");
  return {
    id: requiredString(value.id, "Cloud PDF ID"),
    originalName: requiredString(value.originalName, "Cloud PDF нэр"),
    blobUrl: requiredString(value.blobUrl, "Cloud PDF URL"),
    pageCount: Math.max(1, finiteInteger(value.pageCount, 1)),
    fileSize: Math.max(0, finiteInteger(value.fileSize)),
    createdAt: requiredString(value.createdAt, "Cloud PDF createdAt"),
    updatedAt:
      typeof value.updatedAt === "string" && value.updatedAt
        ? value.updatedAt
        : requiredString(value.createdAt, "Cloud PDF updatedAt"),
  };
}

function normalizeGroup(value: unknown): CloudGroup {
  if (!isRecord(value)) throw new CloudProjectError("Cloud бүлгийн мэдээлэл буруу байна.");
  return {
    id: requiredString(value.id, "Cloud бүлгийн ID"),
    clientId: nullableUuid(value.clientId, "Cloud бүлгийн clientId"),
    name: requiredString(value.name, "Cloud бүлгийн нэр"),
    sortOrder: Math.max(0, finiteInteger(value.sortOrder)),
    note: typeof value.note === "string" ? value.note : null,
    lastViewedPage: Math.max(1, finiteInteger(value.lastViewedPage, 1)),
    createdAt: requiredString(value.createdAt, "Cloud бүлгийн createdAt"),
    updatedAt: requiredString(value.updatedAt, "Cloud бүлгийн updatedAt"),
    pdf: normalizePdf(value.pdf),
  };
}

export function normalizeCloudProject(value: unknown): CloudProject {
  if (!isRecord(value) || !Array.isArray(value.groups)) {
    throw new CloudProjectError("Cloud төслийн мэдээлэл буруу байна.");
  }
  return {
    id: requiredString(value.id, "Cloud төслийн ID"),
    shareId: requiredString(value.shareId, "Cloud share ID"),
    name: requiredString(value.name, "Cloud төслийн нэр"),
    revision: Math.max(0, finiteInteger(value.revision)),
    createdAt: requiredString(value.createdAt, "Cloud төслийн createdAt"),
    updatedAt: requiredString(value.updatedAt, "Cloud төслийн updatedAt"),
    groups: value.groups.map(normalizeGroup).sort((a, b) => a.sortOrder - b.sortOrder),
  };
}

function normalizeApiError(payload: unknown, status: number): CloudProjectError {
  const apiError = isRecord(payload)
    ? (payload as CloudApiErrorPayload).error
    : undefined;
  const message =
    apiError && typeof apiError.message === "string" && apiError.message.trim()
      ? apiError.message
      : status === 401 || status === 403
        ? "Cloud төслийг засах эрх хүчингүй байна. Editor холбоосоо дахин нээнэ үү."
        : status === 404
          ? "Cloud төсөл олдсонгүй."
          : "Cloud үйлдлийг гүйцэтгэж чадсангүй.";
  return new CloudProjectError(message, {
    status,
    code: apiError && typeof apiError.code === "string" ? apiError.code : undefined,
  });
}

async function readResponsePayload(response: Response): Promise<unknown> {
  if (response.status === 204) return null;
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { error: { message: text.slice(0, 500) } };
  }
}

async function cloudRequest<T>(
  path: string,
  options: RequestInit & { token?: string } = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");
  if (options.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (options.token) headers.set("Authorization", `Bearer ${options.token}`);

  let response: Response;
  try {
    response = await fetch(path, {
      ...options,
      headers,
      cache: "no-store",
    });
  } catch (cause) {
    throw new CloudProjectError(
      "Cloud сервертэй холбогдож чадсангүй. Интернэт холболтоо шалгаад дахин оролдоно уу.",
      { cause },
    );
  }
  const payload = await readResponsePayload(response);
  if (!response.ok) throw normalizeApiError(payload, response.status);
  if (isRecord(payload) && "data" in payload) return payload.data as T;
  return payload as T;
}

function jsonBody(value: unknown): string {
  return JSON.stringify(value);
}

function absoluteUrl(value: string, fallbackPath: string): string {
  if (typeof window === "undefined") return fallbackPath;
  try {
    return new URL(value || fallbackPath, window.location.origin).toString();
  } catch {
    return new URL(fallbackPath, window.location.origin).toString();
  }
}

function bindingStorageKey(project: Pick<PdfProject, "id" | "createdAt">): string {
  return `${CLOUD_BINDING_PREFIX}${encodeURIComponent(project.id)}:${encodeURIComponent(project.createdAt)}`;
}

function pendingCreateStorageKey(project: Pick<PdfProject, "id" | "createdAt">): string {
  return `${PENDING_CREATE_PREFIX}${encodeURIComponent(project.id)}:${encodeURIComponent(project.createdAt)}`;
}

function editorTokenStorageKey(projectId: string): string {
  return `${EDITOR_TOKEN_PREFIX}${encodeURIComponent(projectId)}`;
}

type StoredCloudBinding = Omit<CloudBinding, "clientGroupIds"> & {
  clientGroupIds?: Record<string, string>;
};

function isStoredCloudBinding(
  value: unknown,
  project: Pick<PdfProject, "id" | "createdAt">,
): value is StoredCloudBinding {
  if (!isRecord(value)) return false;
  return (
    value.version === CLOUD_BINDING_VERSION &&
    value.localProjectId === project.id &&
    value.localProjectCreatedAt === project.createdAt &&
    typeof value.projectId === "string" &&
    typeof value.shareId === "string" &&
    typeof value.editToken === "string" &&
    typeof value.shareUrl === "string" &&
    typeof value.editorUrl === "string" &&
    isRecord(value.groupMap) &&
    (value.clientGroupIds === undefined || isRecord(value.clientGroupIds)) &&
    isRecord(value.uploadedFileKeys)
  );
}

function stringRecord(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
}

function loadBinding(project: Pick<PdfProject, "id" | "createdAt">): CloudBinding | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(bindingStorageKey(project));
    if (!value) return null;
    const parsed = JSON.parse(value) as unknown;
    if (!isStoredCloudBinding(parsed, project)) return null;
    return {
      ...parsed,
      groupMap: stringRecord(parsed.groupMap),
      clientGroupIds: stringRecord(parsed.clientGroupIds),
      uploadedFileKeys: stringRecord(parsed.uploadedFileKeys),
    };
  } catch {
    return null;
  }
}

function isPendingCloudCreate(
  value: unknown,
  project: Pick<PdfProject, "id" | "createdAt">,
): value is PendingCloudCreate {
  if (
    !isRecord(value) ||
    value.version !== PENDING_CREATE_VERSION ||
    value.localProjectId !== project.id ||
    value.localProjectCreatedAt !== project.createdAt ||
    typeof value.idempotencyKey !== "string" ||
    !isUuidV4(value.idempotencyKey) ||
    typeof value.requestBody !== "string" ||
    !Array.isArray(value.groups)
  ) {
    return false;
  }
  const groupsAreValid = value.groups.every((group) => (
    isRecord(group) &&
    typeof group.localGroupId === "string" &&
    group.localGroupId.length > 0 &&
    typeof group.clientId === "string" &&
    isUuidV4(group.clientId)
  ));
  if (!groupsAreValid) return false;
  const groups = value.groups as PendingCloudCreate["groups"];
  if (
    new Set(groups.map((group) => group.localGroupId)).size !== groups.length ||
    new Set(groups.map((group) => group.clientId)).size !== groups.length
  ) {
    return false;
  }
  try {
    const request = JSON.parse(value.requestBody) as unknown;
    return (
      isRecord(request) &&
      Array.isArray(request.groups) &&
      request.groups.length === groups.length &&
      request.groups.every((group, index) => (
        isRecord(group) && group.clientId === groups[index]!.clientId
      ))
    );
  } catch {
    return false;
  }
}

function loadPendingCreate(
  project: Pick<PdfProject, "id" | "createdAt">,
): PendingCloudCreate | null {
  const key = pendingCreateStorageKey(project);
  const inMemory = pendingCreateMemory.get(key);
  if (inMemory && isPendingCloudCreate(inMemory, project)) return inMemory;
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(key);
    if (!value) return null;
    const parsed = JSON.parse(value) as unknown;
    if (!isPendingCloudCreate(parsed, project)) return null;
    pendingCreateMemory.set(key, parsed);
    return parsed;
  } catch {
    return null;
  }
}

function persistPendingCreate(pending: PendingCloudCreate): boolean {
  const key = pendingCreateStorageKey({
    id: pending.localProjectId,
    createdAt: pending.localProjectCreatedAt,
  });
  pendingCreateMemory.set(key, pending);
  if (typeof window === "undefined") return false;
  try {
    const serialized = JSON.stringify(pending);
    window.localStorage.setItem(key, serialized);
    return window.localStorage.getItem(key) === serialized;
  } catch {
    return false;
  }
}

function clearPendingCreate(project: Pick<PdfProject, "id" | "createdAt">): void {
  const key = pendingCreateStorageKey(project);
  pendingCreateMemory.delete(key);
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // A persisted binding takes precedence over a stale pending create record.
  }
}

function persistBinding(
  project: Pick<PdfProject, "id" | "createdAt">,
  binding: CloudBinding,
): boolean {
  if (typeof window === "undefined") return false;
  try {
    const bindingKey = bindingStorageKey(project);
    const tokenKey = editorTokenStorageKey(binding.projectId);
    const serialized = JSON.stringify(binding);
    window.localStorage.setItem(bindingKey, serialized);
    window.localStorage.setItem(tokenKey, binding.editToken);
    return (
      window.localStorage.getItem(bindingKey) === serialized &&
      window.localStorage.getItem(tokenKey) === binding.editToken
    );
  } catch {
    // The caller keeps the capability in React memory and must surface a
    // warning. A successful server create/upload must never become an orphan
    // merely because browser persistence is blocked.
    return false;
  }
}

function captureEditorToken(projectId: string): string | null {
  if (typeof window === "undefined") return null;
  const url = new URL(window.location.href);
  const queryToken = url.searchParams.get("token")?.trim() || null;
  const fragmentParams = new URLSearchParams(url.hash.slice(1));
  const fragmentToken = fragmentParams.get("token")?.trim() || null;
  const bootstrapToken = queryToken ?? fragmentToken;
  let storedToken: string | null = null;
  try {
    storedToken = window.localStorage.getItem(editorTokenStorageKey(projectId));
  } catch {
    // The URL bootstrap token remains usable when localStorage is disabled.
  }
  const token = bootstrapToken ?? storedToken;
  if (!token) return null;

  if (bootstrapToken) {
    let safelyStored = false;
    try {
      window.localStorage.setItem(editorTokenStorageKey(projectId), bootstrapToken);
      safelyStored = window.localStorage.getItem(editorTokenStorageKey(projectId)) === bootstrapToken;
    } catch {
      safelyStored = false;
    }
    if (safelyStored) {
      url.searchParams.delete("token");
      fragmentParams.delete("token");
      url.hash = fragmentParams.size > 0 ? fragmentParams.toString() : "";
      window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    }
  }
  return token;
}

function isUuidV4(value: string): boolean {
  return UUID_V4_PATTERN.test(value);
}

function secureRandomUuid(): string {
  const id = globalThis.crypto?.randomUUID?.();
  if (!id || !isUuidV4(id)) {
    throw new CloudProjectError(
      "Secure ID үүсгэж чадсангүй. HTTPS холболтоор дахин оролдоно уу.",
    );
  }
  return id;
}

function createPendingCloudCreate(project: PdfProject): PendingCloudCreate {
  const groups = project.groups.map((group) => ({
    localGroupId: group.id,
    clientId: secureRandomUuid(),
  }));
  return {
    version: PENDING_CREATE_VERSION,
    localProjectId: project.id,
    localProjectCreatedAt: project.createdAt,
    idempotencyKey: secureRandomUuid(),
    requestBody: jsonBody({
      name: project.name,
      groups: project.groups.map((group, index) => ({
        clientId: groups[index]!.clientId,
        name: group.name,
        note: group.note,
        lastViewedPage: group.lastViewedPage,
      })),
    }),
    groups,
  };
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

async function fetchEditorProject(projectId: string, token: string): Promise<CloudProject> {
  const data = await cloudRequest<{ project: unknown }>(`/api/projects/${encodeURIComponent(projectId)}`, {
    token,
  });
  return normalizeCloudProject(data.project);
}

async function waitForUploadedPdf(
  projectId: string,
  token: string,
  expectation: UploadExpectation,
): Promise<CloudProject> {
  for (let attempt = 0; attempt <= CALLBACK_POLL_DELAYS_MS.length; attempt += 1) {
    if (attempt > 0) await delay(CALLBACK_POLL_DELAYS_MS[attempt - 1]!);
    const latest = await fetchEditorProject(projectId, token);
    const pdf = latest.groups.find((group) => group.id === expectation.groupId)?.pdf;
    if (
      pdf &&
      pdf.blobUrl === expectation.blobUrl &&
      pdf.originalName === expectation.originalName &&
      pdf.pageCount === expectation.pageCount &&
      pdf.fileSize === expectation.fileSize
    ) {
      return latest;
    }
  }
  throw new CloudProjectError(
    "PDF Blob-д орсон боловч metadata баталгаажаагүй байна. Түр хүлээгээд дахин хадгална уу.",
  );
}

async function uploadPdfToCloud(options: {
  projectId: string;
  groupId: string;
  token: string;
  blob: Blob;
  originalName: string;
  pageCount: number;
  onProgress?: (loaded: number, total: number, percentage: number) => void;
}): Promise<{ url: string }> {
  // Blob URLs are public. Keep internal project/group identifiers out of the
  // pathname; authorization context travels only in the signed client payload.
  const pathname = `pdfs/${secureRandomUuid()}.pdf`;
  const result = await upload(pathname, options.blob, {
    access: "public",
    handleUploadUrl: "/api/blob/upload",
    headers: { Authorization: `Bearer ${options.token}` },
    clientPayload: JSON.stringify({
      projectId: options.projectId,
      groupId: options.groupId,
      originalName: options.originalName,
      pageCount: options.pageCount,
      fileSize: options.blob.size,
    }),
    contentType: "application/pdf",
    multipart: options.blob.size > MULTIPART_THRESHOLD_BYTES,
    onUploadProgress: ({ loaded, total, percentage }) => {
      options.onProgress?.(loaded, total, percentage);
    },
  });
  return { url: result.url };
}

function replaceCloudGroup(project: CloudProject, group: CloudGroup): CloudProject {
  const exists = project.groups.some((candidate) => candidate.id === group.id);
  const groups = exists
    ? project.groups.map((candidate) => (candidate.id === group.id ? group : candidate))
    : [...project.groups, group];
  return { ...project, groups: groups.sort((a, b) => a.sortOrder - b.sortOrder) };
}

function remoteGroupForLocal(
  cloudProject: CloudProject,
  binding: CloudBinding,
  localGroup: PdfGroup,
): CloudGroup | undefined {
  const remoteId = binding.groupMap[localGroup.id];
  return remoteId
    ? cloudProject.groups.find((group) => group.id === remoteId)
    : undefined;
}

function cloudGroupPatch(local: PdfGroup, remote: CloudGroup): UnknownRecord | null {
  const nextNote = local.note ?? null;
  const changes: UnknownRecord = {};
  if (local.name !== remote.name) changes.name = local.name;
  if (nextNote !== remote.note) changes.note = nextNote;
  if (local.lastViewedPage !== remote.lastViewedPage) {
    changes.lastViewedPage = local.lastViewedPage;
  }
  return Object.keys(changes).length > 0 ? changes : null;
}

const IDLE_PROGRESS: CloudSyncProgress = {
  phase: "idle",
  percent: 0,
  message: "Cloud-д хадгалахад бэлэн.",
  completedFiles: 0,
  totalFiles: 0,
};

export function useCloudMigration({ project, getPdfBlob }: CloudMigrationOptions) {
  const [binding, setBinding] = useState<CloudBinding | null>(null);
  const [cloudProject, setCloudProject] = useState<CloudProject | null>(null);
  const [progress, setProgress] = useState<CloudSyncProgress>(IDLE_PROGRESS);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const savingRef = useRef(false);
  const projectIdentity = useMemo(
    () => ({ id: project.id, createdAt: project.createdAt }),
    [project.createdAt, project.id],
  );

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      const stored = loadBinding(projectIdentity);
      setBinding(stored);
      setCloudProject(null);
      setError(null);
      setWarning(null);
      setProgress(IDLE_PROGRESS);
    });
    return () => {
      active = false;
    };
  }, [projectIdentity]);

  const saveToCloud = useCallback(async (): Promise<CloudBinding> => {
    if (savingRef.current) {
      throw new CloudProjectError("Cloud хадгалалт аль хэдийн ажиллаж байна.");
    }
    savingRef.current = true;
    setError(null);
    setWarning(null);
    const snapshot = project;
    let activeBinding = binding ?? loadBinding(snapshot);
    let remote: CloudProject;

    try {
      if (!activeBinding) {
        setProgress({
          phase: "creating",
          percent: 2,
          message: "Cloud төсөл үүсгэж байна…",
          completedFiles: 0,
          totalFiles: snapshot.groups.filter((group) => group.fileKey).length,
        });
        // The serialized body and UUID key are one durable unit. Rebuilding
        // the body under the same key would correctly trigger a server-side
        // idempotency conflict when the local project changed between retries.
        const pendingCreate = loadPendingCreate(snapshot) ?? createPendingCloudCreate(snapshot);
        if (!persistPendingCreate(pendingCreate)) {
          setWarning(
            "Cloud үүсгэх retry түлхүүрийг browser-д хадгалж чадсангүй. Энэ цонхыг хаалгүй дахин оролдоно уу; үүссэний дараа editor холбоосоо нэн даруй хуулна уу.",
          );
        }
        const data = await cloudRequest<{
          project: unknown;
          editToken: string;
          editorUrl: string;
          shareUrl: string;
        }>("/api/projects", {
          method: "POST",
          headers: { "Idempotency-Key": pendingCreate.idempotencyKey },
          body: pendingCreate.requestBody,
        });
        const created: CreateProjectResponse = {
          project: normalizeCloudProject(data.project),
          editToken: requiredString(data.editToken, "Cloud editor token"),
          editorUrl: requiredString(data.editorUrl, "Cloud editor URL"),
          shareUrl: requiredString(data.shareUrl, "Cloud share URL"),
        };
        if (created.project.groups.length < pendingCreate.groups.length) {
          throw new CloudProjectError("Cloud бүлгүүдийг бүрэн үүсгэж чадсангүй.");
        }
        const groupMap = Object.fromEntries(
          pendingCreate.groups.map((group, index) => [
            group.localGroupId,
            created.project.groups[index]!.id,
          ]),
        );
        const clientGroupIds = Object.fromEntries(
          pendingCreate.groups.map((group) => [group.localGroupId, group.clientId]),
        );
        activeBinding = {
          version: CLOUD_BINDING_VERSION,
          localProjectId: snapshot.id,
          localProjectCreatedAt: snapshot.createdAt,
          projectId: created.project.id,
          shareId: created.project.shareId,
          editToken: created.editToken,
          shareUrl: absoluteUrl(created.shareUrl, `/share/${created.project.shareId}`),
          editorUrl: absoluteUrl(
            created.editorUrl,
            `/project/${created.project.id}#token=${encodeURIComponent(created.editToken)}`,
          ),
          groupMap,
          clientGroupIds,
          uploadedFileKeys: {},
        };
        // Persist the capability before the first Blob upload so a partial
        // migration can always resume without creating an orphan project.
        setBinding(activeBinding);
        if (persistBinding(snapshot, activeBinding)) {
          clearPendingCreate(snapshot);
          setWarning(null);
        } else {
          setWarning(
            "Cloud төсөл үүслээ, гэхдээ editor эрхийг browser-д хадгалж чадсангүй. Editor холбоосоо одоо хуулж аюулгүй хадгална уу.",
          );
        }
        remote = created.project;
      } else {
        if (persistBinding(snapshot, activeBinding)) clearPendingCreate(snapshot);
        remote = await fetchEditorProject(activeBinding.projectId, activeBinding.editToken);

        // A lost create-group response can leave the server row committed
        // before its local groupMap entry is persisted. Recover that mapping
        // by the stable clientId before classifying any remote-only groups.
        const remoteIds = new Set(remote.groups.map((group) => group.id));
        const remoteByClientId = new Map(
          remote.groups.flatMap((group) => (
            group.clientId ? [[group.clientId, group] as const] : []
          )),
        );
        const reconciledGroupMap = { ...activeBinding.groupMap };
        let didReconcileMapping = false;
        for (const localGroup of snapshot.groups) {
          const mappedRemoteId = reconciledGroupMap[localGroup.id];
          if (mappedRemoteId && remoteIds.has(mappedRemoteId)) continue;
          const stableClientId = activeBinding.clientGroupIds[localGroup.id];
          const recoveredRemote = stableClientId
            ? remoteByClientId.get(stableClientId)
            : undefined;
          if (!recoveredRemote) continue;

          const mappedLocalId = Object.entries(reconciledGroupMap).find(
            ([candidateLocalId, candidateRemoteId]) => (
              candidateLocalId !== localGroup.id && candidateRemoteId === recoveredRemote.id
            ),
          )?.[0];
          if (mappedLocalId) {
            throw new CloudProjectError(
              "Cloud бүлгийн local mapping зөрчилтэй байна. Өгөгдөл хамгаалахын тулд sync зогслоо; editor холбоосоор төслөө шалгана уу.",
              { status: 409, code: "CLOUD_GROUP_MAPPING_CONFLICT" },
            );
          }
          reconciledGroupMap[localGroup.id] = recoveredRemote.id;
          didReconcileMapping = true;
        }
        if (didReconcileMapping) {
          activeBinding = { ...activeBinding, groupMap: reconciledGroupMap };
          setBinding(activeBinding);
          if (!persistBinding(snapshot, activeBinding)) {
            setWarning(
              "Сэргээсэн cloud mapping-ийг browser-д хадгалж чадсангүй. Энэ цонхыг хаалгүй sync-ээ үргэлжлүүлнэ үү; editor холбоосоо хуулж хадгална уу.",
            );
          }
        }

        // A group created in the cloud editor has no local mapping. Treat that
        // as a divergence before changing any remote metadata: local sync must
        // never silently overwrite or strand edits made from the editor.
        const mappedRemoteIds = new Set(Object.values(activeBinding.groupMap));
        const cloudOnlyGroups = remote.groups.filter(
          (remoteGroup) => !mappedRemoteIds.has(remoteGroup.id),
        );
        if (cloudOnlyGroups.length > 0) {
          const preview = cloudOnlyGroups
            .slice(0, 3)
            .map((group) => `“${group.name}”`)
            .join(", ");
          const remainingCount = cloudOnlyGroups.length - 3;
          const remaining = remainingCount > 0 ? ` болон өөр ${remainingCount} бүлэг` : "";
          throw new CloudProjectError(
            `Cloud editor дээр local төсөлтэй холбогдоогүй ${cloudOnlyGroups.length} бүлэг байна: ${preview}${remaining}. Өгөгдөл хамгаалахын тулд sync зогссон бөгөөд cloud төсөлд өөрчлөлт хийгээгүй. Cloud хувилбараа хадгалах бол editor холбоосоор үргэлжлүүлнэ үү. Local хувилбарыг cloud-д оруулах бол editor дээр нэмсэн бүлгүүдээ эхлээд устгаад дахин “Cloud-д хадгалах” дарна уу.`,
            { status: 409, code: "CLOUD_ONLY_GROUPS_CONFLICT" },
          );
        }
      }

      setProgress((current) => ({
        ...current,
        phase: "syncing-metadata",
        percent: Math.max(current.percent, 6),
        message: "Бүлгийн мэдээллийг синк хийж байна…",
      }));

      if (remote.name !== snapshot.name) {
        const data = await cloudRequest<{ project: unknown }>(
          `/api/projects/${encodeURIComponent(activeBinding.projectId)}`,
          {
            method: "PATCH",
            token: activeBinding.editToken,
            body: jsonBody({ name: snapshot.name }),
          },
        );
        remote = normalizeCloudProject(data.project);
      }

      const localIds = new Set(snapshot.groups.map((group) => group.id));
      for (const [localId, remoteId] of Object.entries(activeBinding.groupMap)) {
        if (localIds.has(localId)) continue;
        if (remote.groups.some((group) => group.id === remoteId)) {
          await cloudRequest<null>(
            `/api/projects/${encodeURIComponent(activeBinding.projectId)}/groups/${encodeURIComponent(remoteId)}`,
            { method: "DELETE", token: activeBinding.editToken },
          );
          remote = await fetchEditorProject(activeBinding.projectId, activeBinding.editToken);
        }
        delete activeBinding.groupMap[localId];
        delete activeBinding.clientGroupIds[localId];
        delete activeBinding.uploadedFileKeys[localId];
        if (!persistBinding(snapshot, activeBinding)) {
          setWarning("Editor эрх browser-д хадгалагдсангүй. Editor холбоосоо хуулж хадгална уу.");
        }
      }

      for (const localGroup of snapshot.groups) {
        let remoteGroup = remoteGroupForLocal(remote, activeBinding, localGroup);
        if (!remoteGroup) {
          const clientId: string = activeBinding.clientGroupIds[localGroup.id] ?? secureRandomUuid();
          if (activeBinding.clientGroupIds[localGroup.id] !== clientId) {
            activeBinding = {
              ...activeBinding,
              clientGroupIds: {
                ...activeBinding.clientGroupIds,
                [localGroup.id]: clientId,
              },
            };
            setBinding(activeBinding);
            if (!persistBinding(snapshot, activeBinding)) {
              setWarning(
                "Шинэ бүлгийн retry ID-г browser-д хадгалж чадсангүй. Энэ цонхыг хаалгүй дахин оролдоно уу; editor холбоосоо хуулж хадгална уу.",
              );
            }
          }
          const data = await cloudRequest<{ group: unknown }>(
            `/api/projects/${encodeURIComponent(activeBinding.projectId)}/groups`,
            {
              method: "POST",
              token: activeBinding.editToken,
              body: jsonBody({
                clientId,
                name: localGroup.name,
                note: localGroup.note,
                lastViewedPage: localGroup.lastViewedPage,
              }),
            },
          );
          remoteGroup = normalizeGroup(data.group);
          remote = replaceCloudGroup(remote, remoteGroup);
          activeBinding.groupMap[localGroup.id] = remoteGroup.id;
          if (!persistBinding(snapshot, activeBinding)) {
            setWarning("Editor эрх browser-д хадгалагдсангүй. Editor холбоосоо хуулж хадгална уу.");
          }
        }

        const patch = cloudGroupPatch(localGroup, remoteGroup);
        if (patch) {
          const data = await cloudRequest<{ group: unknown }>(
            `/api/projects/${encodeURIComponent(activeBinding.projectId)}/groups/${encodeURIComponent(remoteGroup.id)}`,
            {
              method: "PATCH",
              token: activeBinding.editToken,
              body: jsonBody(patch),
            },
          );
          remoteGroup = normalizeGroup(data.group);
          remote = replaceCloudGroup(remote, remoteGroup);
        }
      }

      const desiredOrder = snapshot.groups.map((group) => activeBinding!.groupMap[group.id]!);
      const currentOrder = remote.groups.map((group) => group.id);
      if (desiredOrder.some((id, index) => id !== currentOrder[index])) {
        const data = await cloudRequest<{ project: unknown }>(
          `/api/projects/${encodeURIComponent(activeBinding.projectId)}/groups/reorder`,
          {
            method: "PUT",
            token: activeBinding.editToken,
            body: jsonBody({ groupIds: desiredOrder }),
          },
        );
        remote = normalizeCloudProject(data.project);
      }

      const pendingUploads = snapshot.groups.filter((localGroup) => {
        if (!localGroup.fileKey || !localGroup.fileName) return false;
        const remotePdf = remoteGroupForLocal(remote, activeBinding!, localGroup)?.pdf;
        return (
          activeBinding!.uploadedFileKeys[localGroup.id] !== localGroup.fileKey ||
          !remotePdf ||
          remotePdf.originalName !== localGroup.fileName ||
          remotePdf.pageCount !== localGroup.pageCount ||
          remotePdf.fileSize !== (localGroup.fileSize ?? 0)
        );
      });

      for (const localGroup of snapshot.groups) {
        const remoteGroup = remoteGroupForLocal(remote, activeBinding, localGroup);
        if (localGroup.fileName) {
          if (localGroup.fileKey) continue;
          // Metadata with no local fileKey means IndexedDB/import recovery is
          // incomplete, not that the user explicitly removed the PDF. Never
          // destroy an already-published cloud file in this state.
          if (!remoteGroup?.pdf) {
            throw new CloudProjectError(
              `“${localGroup.name}” бүлгийн PDF local хадгалалтаас олдсонгүй. Файлаа дахин сонгоод хадгална уу.`,
            );
          }
          continue;
        }
        if (remoteGroup?.pdf) {
          await cloudRequest<null>(
            `/api/projects/${encodeURIComponent(activeBinding.projectId)}/groups/${encodeURIComponent(remoteGroup.id)}/pdf`,
            { method: "DELETE", token: activeBinding.editToken },
          );
          remote = await fetchEditorProject(activeBinding.projectId, activeBinding.editToken);
        }
        delete activeBinding.uploadedFileKeys[localGroup.id];
      }

      const totalBytes = pendingUploads.reduce(
        (sum, group) => sum + Math.max(0, group.fileSize ?? 0),
        0,
      );
      let completedBytes = 0;
      let completedFiles = 0;

      for (const localGroup of pendingUploads) {
        const remoteGroupId = activeBinding.groupMap[localGroup.id];
        if (!remoteGroupId || !localGroup.fileKey || !localGroup.fileName) {
          throw new CloudProjectError(`“${localGroup.name}” бүлгийн cloud mapping дутуу байна.`);
        }
        setProgress({
          phase: "reading-files",
          percent: totalBytes > 0 ? Math.round((completedBytes / totalBytes) * 94) + 6 : 6,
          message: "Local PDF-г уншиж байна…",
          currentFile: localGroup.fileName,
          completedFiles,
          totalFiles: pendingUploads.length,
        });
        const blob = await getPdfBlob(localGroup.id);
        if (!blob) {
          throw new CloudProjectError(
            `“${localGroup.name}” бүлгийн PDF local хадгалалтаас олдсонгүй. Файлаа дахин сонгоно уу.`,
          );
        }

        const result = await uploadPdfToCloud({
          projectId: activeBinding.projectId,
          groupId: remoteGroupId,
          token: activeBinding.editToken,
          blob,
          originalName: localGroup.fileName,
          pageCount: localGroup.pageCount,
          onProgress: (loaded) => {
            const loadedBytes = completedBytes + Math.min(loaded, blob.size);
            const percentage = totalBytes > 0
              ? Math.min(99, Math.round((loadedBytes / totalBytes) * 94) + 6)
              : 90;
            setProgress({
              phase: "uploading",
              percent: percentage,
              message: "PDF cloud руу байршуулж байна…",
              currentFile: localGroup.fileName,
              completedFiles,
              totalFiles: pendingUploads.length,
            });
          },
        });

        setProgress({
          phase: "verifying",
          percent: totalBytes > 0
            ? Math.min(99, Math.round(((completedBytes + blob.size) / totalBytes) * 94) + 6)
            : 96,
          message: "PDF metadata баталгаажуулж байна…",
          currentFile: localGroup.fileName,
          completedFiles,
          totalFiles: pendingUploads.length,
        });
        remote = await waitForUploadedPdf(activeBinding.projectId, activeBinding.editToken, {
          groupId: remoteGroupId,
          blobUrl: result.url,
          originalName: localGroup.fileName,
          fileSize: blob.size,
          pageCount: localGroup.pageCount,
        });
        activeBinding.uploadedFileKeys[localGroup.id] = localGroup.fileKey;
        completedBytes += blob.size;
        completedFiles += 1;
        if (!persistBinding(snapshot, activeBinding)) {
          setWarning("Editor эрх browser-д хадгалагдсангүй. Editor холбоосоо хуулж хадгална уу.");
        }
      }

      remote = await fetchEditorProject(activeBinding.projectId, activeBinding.editToken);
      for (const localGroup of snapshot.groups) {
        if (!localGroup.fileKey || !localGroup.fileName) continue;
        if (!remoteGroupForLocal(remote, activeBinding, localGroup)?.pdf) {
          throw new CloudProjectError(
            `“${localGroup.name}” бүлгийн PDF cloud дээр баталгаажаагүй байна. Дахин хадгална уу.`,
          );
        }
      }

      activeBinding = {
        ...activeBinding,
        shareId: remote.shareId,
        shareUrl: absoluteUrl(activeBinding.shareUrl, `/share/${remote.shareId}`),
        lastSyncedAt: new Date().toISOString(),
      };
      if (!persistBinding(snapshot, activeBinding)) {
        setWarning("Editor эрх browser-д хадгалагдсангүй. Editor холбоосоо хуулж хадгална уу.");
      }
      setBinding(activeBinding);
      setCloudProject(remote);
      setProgress({
        phase: "complete",
        percent: 100,
        message: "Project амжилттай cloud-д хадгалагдлаа.",
        completedFiles,
        totalFiles: pendingUploads.length,
      });
      return activeBinding;
    } catch (caught) {
      const message = caught instanceof Error && caught.message
        ? caught.message
        : "Cloud хадгалалтын үед алдаа гарлаа.";
      setError(message);
      setProgress((current) => ({
        ...current,
        phase: "error",
        message,
      }));
      throw caught instanceof Error ? caught : new CloudProjectError(message, { cause: caught });
    } finally {
      savingRef.current = false;
    }
  }, [binding, getPdfBlob, project]);

  const clearError = useCallback(() => setError(null), []);

  return {
    binding,
    cloudProject,
    progress,
    error,
    warning,
    isSaving: progress.phase !== "idle" &&
      progress.phase !== "complete" &&
      progress.phase !== "error",
    isComplete: progress.phase === "complete",
    saveToCloud,
    clearError,
  };
}

export interface UseCloudProjectResult {
  project: CloudProject | null;
  selectedGroup: CloudGroup | undefined;
  selectedGroupId: string | undefined;
  isLoading: boolean;
  isBusy: boolean;
  error: string | null;
  hasEditToken: boolean;
  shareUrl: string | null;
  editorUrl: string | null;
  uploadProgress: number | null;
  refresh: () => Promise<CloudProject>;
  selectGroup: (groupId: string) => void;
  renameProject: (name: string) => Promise<void>;
  addGroup: (name?: string) => Promise<CloudGroup>;
  updateGroup: (
    groupId: string,
    changes: { name?: string; note?: string | null; lastViewedPage?: number },
  ) => Promise<CloudGroup>;
  deleteGroup: (groupId: string) => Promise<void>;
  reorderGroups: (activeId: string, overId: string) => Promise<void>;
  uploadPdf: (
    groupId: string,
    file: File,
    pageCount: number,
  ) => Promise<void>;
  removePdf: (groupId: string) => Promise<void>;
  getPdfBlob: (groupId: string) => Promise<Blob | null>;
  updateLastViewedPage: (groupId: string, page: number) => void;
}

export function useCloudProject(projectId: string): UseCloudProjectResult {
  const [token, setToken] = useState<string | null>(null);
  const tokenRef = useRef<string | null>(null);
  const [project, setProject] = useState<CloudProject | null>(null);
  const projectRef = useRef<CloudProject | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string>();
  const [isLoading, setIsLoading] = useState(true);
  const [pendingOperations, setPendingOperations] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const pageTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const pendingPagesRef = useRef(new Map<string, number>());

  const applyProject = useCallback((next: CloudProject): CloudProject => {
    projectRef.current = next;
    setProject(next);
    setSelectedGroupId((current) =>
      current && next.groups.some((group) => group.id === current)
        ? current
        : next.groups[0]?.id,
    );
    return next;
  }, []);

  const requireToken = useCallback((): string => {
    const current = tokenRef.current;
    if (!current) {
      throw new CloudProjectError(
        "Editor token олдсонгүй. Token-той editor холбоосыг дахин нээнэ үү.",
        { status: 401 },
      );
    }
    return current;
  }, []);

  const refresh = useCallback(async (): Promise<CloudProject> => {
    const next = await fetchEditorProject(projectId, requireToken());
    setError(null);
    return applyProject(next);
  }, [applyProject, projectId, requireToken]);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      const captured = captureEditorToken(projectId);
      tokenRef.current = captured;
      setToken(captured);
      if (!captured) {
        setError("Editor token олдсонгүй. Token-той editor холбоосыг дахин нээнэ үү.");
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      void fetchEditorProject(projectId, captured)
        .then((next) => {
          if (active) applyProject(next);
        })
        .catch((caught: unknown) => {
          if (active) {
            setError(caught instanceof Error ? caught.message : "Cloud төслийг ачаалж чадсангүй.");
          }
        })
        .finally(() => {
          if (active) setIsLoading(false);
        });
    });
    return () => {
      active = false;
    };
  }, [applyProject, projectId]);

  useEffect(() => {
    const pageTimers = pageTimersRef.current;
    const flushPendingPages = () => {
      const currentToken = tokenRef.current;
      if (!currentToken) return;
      for (const [groupId, page] of pendingPagesRef.current) {
        void fetch(
          `/api/projects/${encodeURIComponent(projectId)}/groups/${encodeURIComponent(groupId)}`,
          {
            method: "PATCH",
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
              Authorization: `Bearer ${currentToken}`,
            },
            body: jsonBody({ lastViewedPage: page }),
            keepalive: true,
          },
        ).catch(() => undefined);
      }
      pendingPagesRef.current.clear();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") flushPendingPages();
    };
    window.addEventListener("pagehide", flushPendingPages);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("pagehide", flushPendingPages);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      flushPendingPages();
      for (const timer of pageTimers.values()) clearTimeout(timer);
      pageTimers.clear();
    };
  }, [projectId]);

  const runMutation = useCallback(async <T,>(operation: () => Promise<T>): Promise<T> => {
    setPendingOperations((count) => count + 1);
    setError(null);
    try {
      return await operation();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Cloud үйлдэл амжилтгүй боллоо.";
      setError(message);
      throw caught;
    } finally {
      setPendingOperations((count) => Math.max(0, count - 1));
    }
  }, []);

  const renameProject = useCallback(
    (name: string): Promise<void> => runMutation(async () => {
      const data = await cloudRequest<{ project: unknown }>(
        `/api/projects/${encodeURIComponent(projectId)}`,
        { method: "PATCH", token: requireToken(), body: jsonBody({ name }) },
      );
      applyProject(normalizeCloudProject(data.project));
    }),
    [applyProject, projectId, requireToken, runMutation],
  );

  const addGroup = useCallback(
    (name?: string): Promise<CloudGroup> => {
      const clientId = secureRandomUuid();
      return runMutation(async () => {
        const data = await cloudRequest<{ group: unknown }>(
          `/api/projects/${encodeURIComponent(projectId)}/groups`,
          {
            method: "POST",
            token: requireToken(),
            body: jsonBody(name ? { clientId, name } : { clientId }),
          },
        );
        const group = normalizeGroup(data.group);
        const current = projectRef.current;
        if (current) applyProject(replaceCloudGroup(current, group));
        setSelectedGroupId(group.id);
        return group;
      });
    },
    [applyProject, projectId, requireToken, runMutation],
  );

  const updateGroup = useCallback(
    (
      groupId: string,
      changes: { name?: string; note?: string | null; lastViewedPage?: number },
    ): Promise<CloudGroup> => runMutation(async () => {
      const data = await cloudRequest<{ group: unknown }>(
        `/api/projects/${encodeURIComponent(projectId)}/groups/${encodeURIComponent(groupId)}`,
        {
          method: "PATCH",
          token: requireToken(),
          body: jsonBody(changes),
        },
      );
      const group = normalizeGroup(data.group);
      const current = projectRef.current;
      if (current) applyProject(replaceCloudGroup(current, group));
      return group;
    }),
    [applyProject, projectId, requireToken, runMutation],
  );

  const deleteGroup = useCallback(
    (groupId: string): Promise<void> => runMutation(async () => {
      const pageTimer = pageTimersRef.current.get(groupId);
      if (pageTimer) clearTimeout(pageTimer);
      pageTimersRef.current.delete(groupId);
      pendingPagesRef.current.delete(groupId);
      await cloudRequest<null>(
        `/api/projects/${encodeURIComponent(projectId)}/groups/${encodeURIComponent(groupId)}`,
        { method: "DELETE", token: requireToken() },
      );
      await refresh();
    }),
    [projectId, refresh, requireToken, runMutation],
  );

  const reorderGroups = useCallback(
    (activeId: string, overId: string): Promise<void> => runMutation(async () => {
      const current = projectRef.current;
      if (!current || activeId === overId) return;
      const groupIds = current.groups.map((group) => group.id);
      const fromIndex = groupIds.indexOf(activeId);
      const toIndex = groupIds.indexOf(overId);
      if (fromIndex < 0 || toIndex < 0) return;
      const [moved] = groupIds.splice(fromIndex, 1);
      if (!moved) return;
      groupIds.splice(toIndex, 0, moved);
      const data = await cloudRequest<{ project: unknown }>(
        `/api/projects/${encodeURIComponent(projectId)}/groups/reorder`,
        {
          method: "PUT",
          token: requireToken(),
          body: jsonBody({ groupIds }),
        },
      );
      applyProject(normalizeCloudProject(data.project));
    }),
    [applyProject, projectId, requireToken, runMutation],
  );

  const uploadPdf = useCallback(
    (groupId: string, file: File, pageCount: number): Promise<void> =>
      runMutation(async () => {
        setUploadProgress(0);
        try {
          const result = await uploadPdfToCloud({
            projectId,
            groupId,
            token: requireToken(),
            blob: file,
            originalName: file.name,
            pageCount,
            onProgress: (_loaded, _total, percentage) => {
              setUploadProgress(Math.round(percentage));
            },
          });
          const next = await waitForUploadedPdf(projectId, requireToken(), {
            groupId,
            blobUrl: result.url,
            originalName: file.name,
            fileSize: file.size,
            pageCount,
          });
          applyProject(next);
          setUploadProgress(100);
        } finally {
          window.setTimeout(() => setUploadProgress(null), 800);
        }
      }),
    [applyProject, projectId, requireToken, runMutation],
  );

  const removePdf = useCallback(
    (groupId: string): Promise<void> => runMutation(async () => {
      await cloudRequest<null>(
        `/api/projects/${encodeURIComponent(projectId)}/groups/${encodeURIComponent(groupId)}/pdf`,
        { method: "DELETE", token: requireToken() },
      );
      await refresh();
    }),
    [projectId, refresh, requireToken, runMutation],
  );

  const getPdfBlob = useCallback(async (groupId: string): Promise<Blob | null> => {
    const group = projectRef.current?.groups.find((candidate) => candidate.id === groupId);
    if (!group?.pdf) return null;
    let response: Response;
    try {
      response = await fetch(group.pdf.blobUrl, { cache: "force-cache" });
    } catch (cause) {
      throw new CloudProjectError("Cloud PDF-г татаж чадсангүй.", { cause });
    }
    if (!response.ok) {
      throw new CloudProjectError("Cloud PDF-г татаж чадсангүй.", { status: response.status });
    }
    return response.blob();
  }, []);

  const updateLastViewedPage = useCallback((groupId: string, page: number): void => {
    const current = projectRef.current;
    const group = current?.groups.find((candidate) => candidate.id === groupId);
    if (!current || !group || group.lastViewedPage === page) return;
    const optimistic = replaceCloudGroup(current, { ...group, lastViewedPage: page });
    applyProject(optimistic);
    pendingPagesRef.current.set(groupId, page);
    const previousTimer = pageTimersRef.current.get(groupId);
    if (previousTimer) clearTimeout(previousTimer);
    const timer = setTimeout(() => {
      pageTimersRef.current.delete(groupId);
      void updateGroup(groupId, { lastViewedPage: page })
        .then(() => {
          if (pendingPagesRef.current.get(groupId) === page) {
            pendingPagesRef.current.delete(groupId);
          }
        })
        .catch(() => undefined);
    }, 350);
    pageTimersRef.current.set(groupId, timer);
  }, [applyProject, updateGroup]);

  const selectedGroup = useMemo(
    () => project?.groups.find((group) => group.id === selectedGroupId),
    [project, selectedGroupId],
  );

  return {
    project,
    selectedGroup,
    selectedGroupId,
    isLoading,
    isBusy: pendingOperations > 0,
    error,
    hasEditToken: Boolean(token),
    shareUrl: project
      ? absoluteUrl("", `/share/${project.shareId}`)
      : null,
    editorUrl: token
      ? absoluteUrl("", `/project/${projectId}#token=${encodeURIComponent(token)}`)
      : null,
    uploadProgress,
    refresh,
    selectGroup: setSelectedGroupId,
    renameProject,
    addGroup,
    updateGroup,
    deleteGroup,
    reorderGroups,
    uploadPdf,
    removePdf,
    getPdfBlob,
    updateLastViewedPage,
  };
}
