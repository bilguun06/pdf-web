import "server-only";

import { head, type PutBlobResult } from "@vercel/blob";
import {
  handleUpload,
  type HandleUploadBody,
} from "@vercel/blob/client";
import { and, eq, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";

import { db } from "@/db";
import {
  blobDeletionOutbox,
  groups,
  pdfFiles,
  projects,
} from "@/db/schema";
import { authorizeProject } from "@/lib/cloud/auth";
import {
  MAX_PDF_SIZE_BYTES,
  MAX_PROJECT_STORAGE_BYTES,
  PDF_CONTENT_TYPE,
  UUID_PATTERN,
} from "@/lib/cloud/constants";
import { CloudApiError } from "@/lib/cloud/errors";
import { assertSameOrigin } from "@/lib/cloud/http";
import {
  drainBlobDeletionOutbox,
  enqueueAndDrainBlobDeletion,
} from "@/lib/cloud/outbox";
import { assertCloudGroup } from "@/lib/cloud/projects";
import {
  consumeBlobUploadRateLimits,
  trustedForwardedClientIp,
} from "@/lib/cloud/rate-limit";
import {
  parseUploadClientPayload,
  type UploadClientPayload,
} from "@/lib/cloud/validation";

interface UploadTokenPayload extends Omit<UploadClientPayload, "fileSize"> {
  v: 1 | 2 | 3;
  fileSize: number | null;
  generation: number;
  requestedPathname: string;
  issuedAt: number;
}

const BLOB_HOST_PATTERN = /^[a-z0-9]+\.public\.blob\.vercel-storage\.com$/i;
const OPAQUE_REQUESTED_PATHNAME_PATTERN =
  /^pdfs\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.pdf$/i;

function legacyRequestedPathnamePattern(projectId: string, groupId: string): RegExp {
  return new RegExp(
    `^projects/${projectId}/${groupId}/[0-9a-f-]{36}\\.pdf$`,
    "i",
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function completedPathnamePattern(requestedPathname: string): RegExp {
  const requestedBase = requestedPathname.slice(0, -4);
  return new RegExp(
    `^${escapeRegExp(requestedBase)}(?:-[A-Za-z0-9_-]+)?\\.pdf$`,
    "i",
  );
}

function assertPathnameUuid(pathname: string): void {
  const basename = pathname.slice(pathname.lastIndexOf("/") + 1, -4);
  if (!UUID_PATTERN.test(basename)) {
    throw new CloudApiError("VALIDATION_ERROR", "Blob файлын ID буруу байна.", 400);
  }
}

function assertOpaqueRequestedPathname(pathname: string): void {
  if (pathname.length > 240 || !OPAQUE_REQUESTED_PATHNAME_PATTERN.test(pathname)) {
    throw new CloudApiError(
      "VALIDATION_ERROR",
      "Blob pathname буруу байна.",
      400,
    );
  }
  assertPathnameUuid(pathname);
}

function assertCallbackRequestedPathname(
  pathname: string,
  projectId: string,
  groupId: string,
): void {
  if (
    pathname.length > 240 ||
    (!OPAQUE_REQUESTED_PATHNAME_PATTERN.test(pathname) &&
      !legacyRequestedPathnamePattern(projectId, groupId).test(pathname))
  ) {
    throw new CloudApiError(
      "VALIDATION_ERROR",
      "Blob pathname буруу байна.",
      400,
    );
  }
  assertPathnameUuid(pathname);
}

function parseTokenPayload(value: string | null | undefined): UploadTokenPayload {
  if (!value || value.length > 4_096) {
    throw new CloudApiError("BAD_REQUEST", "Upload callback metadata дутуу байна.", 400);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch (error) {
    throw new CloudApiError("BAD_REQUEST", "Upload callback metadata буруу байна.", 400, {
      cause: error,
    });
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new CloudApiError("BAD_REQUEST", "Upload callback metadata буруу байна.", 400);
  }
  const object = parsed as Record<string, unknown>;
  const legacyV1 = object.v === 1 && object.generation === undefined;
  const legacyV2 = object.v === 2;
  const current = object.v === 3;
  const validated = parseUploadClientPayload(
    JSON.stringify({
      projectId: object.projectId,
      groupId: object.groupId,
      originalName: object.originalName,
      pageCount: object.pageCount,
      // v1/v2 tokens may still complete for at most their original one-hour
      // lifetime. New v3 tokens always carry the signed declared byte size.
      fileSize: current ? object.fileSize : 1,
    }),
  );
  if (
    (!legacyV1 && !legacyV2 && !current) ||
    typeof object.requestedPathname !== "string" ||
    typeof object.issuedAt !== "number" ||
    !Number.isSafeInteger(object.issuedAt) ||
    object.issuedAt < 0
  ) {
    throw new CloudApiError("BAD_REQUEST", "Upload callback metadata буруу байна.", 400);
  }
  const generation = legacyV1 ? -1 : object.generation;
  if (!Number.isSafeInteger(generation) || (generation as number) < (legacyV1 ? -1 : 1)) {
    throw new CloudApiError("BAD_REQUEST", "Upload callback generation буруу байна.", 400);
  }
  assertCallbackRequestedPathname(
    object.requestedPathname,
    validated.projectId,
    validated.groupId,
  );
  return {
    v: legacyV1 ? 1 : legacyV2 ? 2 : 3,
    ...validated,
    fileSize: current ? validated.fileSize : null,
    generation: generation as number,
    requestedPathname: object.requestedPathname,
    issuedAt: object.issuedAt,
  };
}

async function readMagicBytes(url: string): Promise<Uint8Array> {
  const response = await fetch(url, {
    headers: { Range: "bytes=0-4" },
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  if (!response.ok || !response.body) {
    throw new CloudApiError("INVALID_PDF", "PDF файлын агуулгыг шалгаж чадсангүй.", 422);
  }
  const reader = response.body.getReader();
  const bytes = new Uint8Array(5);
  let offset = 0;
  try {
    while (offset < bytes.length) {
      const { value, done } = await reader.read();
      if (done || !value) break;
      const length = Math.min(value.length, bytes.length - offset);
      bytes.set(value.subarray(0, length), offset);
      offset += length;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  return bytes.subarray(0, offset);
}

async function validateCompletedBlob(
  blob: PutBlobResult,
  payload: UploadTokenPayload,
): Promise<{ url: string; pathname: string; size: number }> {
  let url: URL;
  try {
    url = new URL(blob.url);
  } catch {
    throw new CloudApiError("BAD_REQUEST", "Blob URL буруу байна.", 400);
  }
  if (url.protocol !== "https:" || !BLOB_HOST_PATTERN.test(url.hostname)) {
    throw new CloudApiError("BAD_REQUEST", "Blob URL зөвшөөрөгдөөгүй байна.", 400);
  }
  if (!completedPathnamePattern(payload.requestedPathname).test(blob.pathname)) {
    throw new CloudApiError("BAD_REQUEST", "Blob pathname хүсэлттэй тохирохгүй байна.", 400);
  }

  const metadata = await head(blob.url);
  if (
    metadata.url !== blob.url ||
    metadata.pathname !== blob.pathname ||
    metadata.size < 1 ||
    metadata.size > MAX_PDF_SIZE_BYTES ||
    (payload.fileSize !== null && metadata.size !== payload.fileSize) ||
    metadata.contentType.split(";", 1)[0]?.toLowerCase() !== PDF_CONTENT_TYPE
  ) {
    throw new CloudApiError("INVALID_PDF", "Оруулсан PDF файлын metadata буруу байна.", 422);
  }

  const magic = await readMagicBytes(metadata.url);
  if (
    magic.length !== 5 ||
    magic[0] !== 0x25 ||
    magic[1] !== 0x50 ||
    magic[2] !== 0x44 ||
    magic[3] !== 0x46 ||
    magic[4] !== 0x2d
  ) {
    throw new CloudApiError("INVALID_PDF", "Файлын агуулга PDF биш байна.", 422);
  }
  return { url: metadata.url, pathname: metadata.pathname, size: metadata.size };
}

async function removeUploadedBlob(
  blob: PutBlobResult,
  payload: UploadTokenPayload,
): Promise<void> {
  if (!completedPathnamePattern(payload.requestedPathname).test(blob.pathname)) {
    return;
  }
  await enqueueAndDrainBlobDeletion(blob.pathname);
}

async function persistCompletedUpload(
  blob: PutBlobResult,
  payload: UploadTokenPayload,
): Promise<void> {
  let metadata: { url: string; pathname: string; size: number };
  try {
    metadata = await validateCompletedBlob(blob, payload);
  } catch (error) {
    if (
      error instanceof CloudApiError &&
      (error.code === "INVALID_PDF" || error.code === "BAD_REQUEST")
    ) {
      await removeUploadedBlob(blob, payload);
      return;
    }
    throw error;
  }

  const now = new Date();
  const pdfId = randomUUID();
  const [lockedProjects, lockedGroups, persistence] = await db.batch([
    db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.id, payload.projectId))
      .for("update"),
    db
      .select({ id: groups.id, pdfGeneration: groups.pdfGeneration })
      .from(groups)
      .where(
        and(
          eq(groups.id, payload.groupId),
          eq(groups.projectId, payload.projectId),
        ),
      )
      .for("update"),
    db.execute<{
      currentGeneration: number | null;
      previousPath: string | null;
      acceptedPath: string | null;
      otherBytes: string | number;
    }>(sql`
      with previous as materialized (
        select ${pdfFiles.blobPath} as blob_path
        from ${pdfFiles}
        where ${pdfFiles.groupId} = ${payload.groupId}
        limit 1
      ), usage as materialized (
        select coalesce(sum(${pdfFiles.fileSize}), 0)::bigint as other_bytes
        from ${pdfFiles}
        inner join ${groups} as project_groups
          on project_groups.id = ${pdfFiles.groupId}
        where project_groups.project_id = ${payload.projectId}
          and ${pdfFiles.groupId} <> ${payload.groupId}
      ), eligible as materialized (
        select ${groups.id}
        from ${groups}, usage
        where ${groups.id} = ${payload.groupId}
          and ${groups.projectId} = ${payload.projectId}
          and ${groups.pdfGeneration} = ${payload.generation}
          and usage.other_bytes + ${metadata.size} <= ${MAX_PROJECT_STORAGE_BYTES}
          and not exists (
            select 1 from ${blobDeletionOutbox}
            where ${blobDeletionOutbox.blobPath} = ${metadata.pathname}
          )
      ), upserted as (
        insert into ${pdfFiles}
          ("id", "group_id", "original_name", "blob_url", "blob_path",
           "page_count", "file_size", "created_at", "updated_at")
        select
          ${pdfId}::uuid,
          eligible.id,
          ${payload.originalName},
          ${metadata.url},
          ${metadata.pathname},
          ${payload.pageCount},
          ${metadata.size},
          ${now},
          ${now}
        from eligible
        on conflict ("group_id") do update
        set "id" = excluded."id",
            "original_name" = excluded."original_name",
            "blob_url" = excluded."blob_url",
            "blob_path" = excluded."blob_path",
            "page_count" = excluded."page_count",
            "file_size" = excluded."file_size",
            "created_at" = excluded."created_at",
            "updated_at" = excluded."updated_at"
        where ${pdfFiles.blobPath} <> excluded."blob_path"
        returning "blob_path"
      ), queued as (
        insert into ${blobDeletionOutbox}
          ("blob_path", "attempt_count", "next_attempt_at", "created_at", "updated_at")
        select previous.blob_path, 0, ${now}, ${now}, ${now}
        from previous, upserted
        where previous.blob_path <> upserted.blob_path
        on conflict ("blob_path") do nothing
        returning "blob_path"
      ), touched as (
        update ${projects}
        set "revision" = ${projects.revision} + 1,
            "updated_at" = ${now}
        where ${projects.id} = ${payload.projectId}
          and exists (select 1 from upserted)
          and (select count(*) from queued) >= 0
        returning ${projects.id}
      )
      select
        (select ${groups.pdfGeneration} from ${groups}
         where ${groups.id} = ${payload.groupId}) as "currentGeneration",
        (select previous.blob_path from previous limit 1) as "previousPath",
        (select upserted.blob_path from upserted limit 1) as "acceptedPath",
        (select usage.other_bytes from usage) as "otherBytes",
        (select count(*) from touched)::integer as "touchedCount"
    `),
  ] as const);

  if (!lockedProjects[0] || !lockedGroups[0]) {
    await removeUploadedBlob(blob, payload);
    return;
  }
  const outcome = persistence.rows[0];
  if (outcome?.acceptedPath) {
    await drainBlobDeletionOutbox();
    return;
  }
  if (outcome?.previousPath === metadata.pathname) {
    return;
  }
  await removeUploadedBlob(blob, payload);
}

async function issuePdfGenerationAndCapacity(
  projectId: string,
  groupId: string,
  declaredFileSize: number,
): Promise<{ generation: number }> {
  const now = new Date();
  const [lockedProjects, lockedGroups, updated] = await db.batch([
    db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.id, projectId))
      .for("update"),
    db
      .select({ id: groups.id })
      .from(groups)
      .where(and(eq(groups.id, groupId), eq(groups.projectId, projectId)))
      .for("update"),
    db.execute<{ generation: number }>(sql`
      update ${groups}
      set "pdf_generation" = ${groups.pdfGeneration} + 1,
          "updated_at" = ${now}
      where ${groups.id} = ${groupId}
        and ${groups.projectId} = ${projectId}
        and ${MAX_PROJECT_STORAGE_BYTES} - coalesce((
          select sum(${pdfFiles.fileSize})::bigint
          from ${pdfFiles}
          inner join ${groups} as project_groups
            on project_groups.id = ${pdfFiles.groupId}
          where project_groups.project_id = ${projectId}
            and ${pdfFiles.groupId} <> ${groupId}
        ), 0) >= ${declaredFileSize}
      returning
        ${groups.pdfGeneration} as generation
    `),
  ] as const);

  if (!lockedProjects[0]) {
    throw new CloudApiError("PROJECT_NOT_FOUND", "Төсөл олдсонгүй.", 404);
  }
  if (!lockedGroups[0]) {
    throw new CloudApiError("GROUP_NOT_FOUND", "Бүлэг олдсонгүй.", 404);
  }
  const row = updated.rows[0];
  if (!row) {
    throw new CloudApiError(
      "PAYLOAD_TOO_LARGE",
      "Төслийн 10 GiB хадгалалтын хязгаарт хүрсэн байна.",
      413,
    );
  }
  return { generation: Number(row.generation) };
}

export async function handleBlobUpload(
  request: Request,
  body: HandleUploadBody,
): Promise<Awaited<ReturnType<typeof handleUpload>>> {
  return handleUpload({
    request,
    body,
    onBeforeGenerateToken: async (pathname, clientPayload) => {
      assertSameOrigin(request);
      const payload = parseUploadClientPayload(clientPayload);
      await authorizeProject(request, payload.projectId);
      await assertCloudGroup(payload.projectId, payload.groupId);
      assertOpaqueRequestedPathname(pathname);
      await consumeBlobUploadRateLimits({
        projectId: payload.projectId,
        clientIp: trustedForwardedClientIp(request),
        fileSize: payload.fileSize,
      });
      const issuance = await issuePdfGenerationAndCapacity(
        payload.projectId,
        payload.groupId,
        payload.fileSize,
      );
      const issuedAt = Date.now();
      const tokenPayload: UploadTokenPayload = {
        v: 3,
        ...payload,
        generation: issuance.generation,
        requestedPathname: pathname,
        issuedAt,
      };
      return {
        allowedContentTypes: [PDF_CONTENT_TYPE],
        maximumSizeInBytes: payload.fileSize,
        validUntil: issuedAt + 60 * 60 * 1000,
        addRandomSuffix: true,
        allowOverwrite: false,
        cacheControlMaxAge: 31_536_000,
        tokenPayload: JSON.stringify(tokenPayload),
      };
    },
    onUploadCompleted: async ({ blob, tokenPayload }) => {
      const payload = parseTokenPayload(tokenPayload);
      await persistCompletedUpload(blob, payload);
    },
  });
}
