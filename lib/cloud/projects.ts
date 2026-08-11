import "server-only";

import { and, asc, eq, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";

import { db } from "@/db";
import {
  blobDeletionOutbox,
  groups,
  pdfFiles,
  projects,
  type GroupRow,
  type PdfFileRow,
} from "@/db/schema";
import {
  DEFAULT_CLOUD_PROJECT_NAME,
  MAX_GROUPS_PER_PROJECT,
} from "@/lib/cloud/constants";
import type {
  CloudGroupDto,
  CloudPdfDto,
  CloudProjectDto,
  SharedProjectDto,
} from "@/lib/cloud/dto";
import { CloudApiError } from "@/lib/cloud/errors";
import {
  createIdempotentEditToken,
  createShareId,
  hashCanonicalPayload,
  hashEditToken,
  hashIdempotencyKey,
} from "@/lib/cloud/ids";
import { drainBlobDeletionOutbox } from "@/lib/cloud/outbox";
import { consumeProjectCreateRateLimit } from "@/lib/cloud/rate-limit";
import type {
  CreateGroupInput,
  CreateProjectInput,
  UpdateGroupInput,
} from "@/lib/cloud/validation";

interface GroupWithPdf {
  group: GroupRow;
  pdf: PdfFileRow | null;
}

function pdfDto(pdf: PdfFileRow): CloudPdfDto {
  return {
    id: pdf.id,
    originalName: pdf.originalName,
    blobUrl: pdf.blobUrl,
    pageCount: pdf.pageCount,
    fileSize: pdf.fileSize,
    createdAt: pdf.createdAt.toISOString(),
    updatedAt: pdf.updatedAt.toISOString(),
  };
}

function groupDto(row: GroupWithPdf): CloudGroupDto {
  return {
    id: row.group.id,
    clientId: row.group.clientId,
    name: row.group.name,
    sortOrder: row.group.sortOrder,
    note: row.group.note,
    lastViewedPage: row.group.lastViewedPage,
    createdAt: row.group.createdAt.toISOString(),
    updatedAt: row.group.updatedAt.toISOString(),
    pdf: row.pdf ? pdfDto(row.pdf) : null,
  };
}

async function selectGroupsWithPdfs(projectId: string): Promise<GroupWithPdf[]> {
  const rows = await db
    .select({ group: groups, pdf: pdfFiles })
    .from(groups)
    .leftJoin(pdfFiles, eq(pdfFiles.groupId, groups.id))
    .where(eq(groups.projectId, projectId))
    .orderBy(asc(groups.sortOrder), asc(groups.id));
  return rows;
}

export async function getCloudProject(projectId: string): Promise<CloudProjectDto> {
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!project) {
    throw new CloudApiError("PROJECT_NOT_FOUND", "Төсөл олдсонгүй.", 404);
  }
  const groupRows = await selectGroupsWithPdfs(project.id);
  return {
    id: project.id,
    shareId: project.shareId,
    name: project.name,
    revision: project.revision,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
    groups: groupRows.map(groupDto),
  };
}

export async function getSharedProject(shareId: string): Promise<SharedProjectDto> {
  const [project] = await db
    .select({
      id: projects.id,
      shareId: projects.shareId,
      name: projects.name,
      updatedAt: projects.updatedAt,
    })
    .from(projects)
    .where(eq(projects.shareId, shareId))
    .limit(1);
  if (!project) {
    throw new CloudApiError(
      "PROJECT_NOT_FOUND",
      "Төсөл олдсонгүй. Холбоос буруу эсвэл төсөл устгагдсан байна.",
      404,
    );
  }
  const groupRows = await selectGroupsWithPdfs(project.id);
  return {
    shareId: project.shareId,
    name: project.name,
    updatedAt: project.updatedAt.toISOString(),
    groups: groupRows.map((row) => {
      const group = groupDto(row);
      return {
        id: group.id,
        name: group.name,
        sortOrder: group.sortOrder,
        note: group.note,
        updatedAt: group.updatedAt,
        pdf: group.pdf,
      };
    }),
  };
}

export async function createCloudProject(
  input: CreateProjectInput,
  idempotencyKey: string,
  clientIp: string,
): Promise<{
  project: CloudProjectDto;
  editToken: string;
  created: boolean;
}> {
  const normalizedPayload = JSON.stringify({
    name: input.name ?? DEFAULT_CLOUD_PROJECT_NAME,
    groups: input.groups.map((group) => ({
      clientId: group.clientId ?? null,
      name: group.name,
      note: group.note,
      lastViewedPage: group.lastViewedPage,
    })),
  });
  const idempotencyKeyHash = hashIdempotencyKey(idempotencyKey);
  const idempotencyPayloadHash = hashCanonicalPayload(normalizedPayload);
  const editToken = createIdempotentEditToken(idempotencyKey);

  const resolveReplay = async (): Promise<{
    project: CloudProjectDto;
    editToken: string;
    created: false;
  } | null> => {
    const [existing] = await db
      .select({
        id: projects.id,
        idempotencyPayloadHash: projects.idempotencyPayloadHash,
      })
      .from(projects)
      .where(eq(projects.idempotencyKeyHash, idempotencyKeyHash))
      .limit(1);
    if (!existing) return null;
    if (existing.idempotencyPayloadHash !== idempotencyPayloadHash) {
      throw new CloudApiError(
        "IDEMPOTENCY_CONFLICT",
        "This Idempotency-Key was already used with a different project payload.",
        409,
      );
    }
    return {
      project: await getCloudProject(existing.id),
      editToken,
      created: false,
    };
  };

  const replay = await resolveReplay();
  if (replay) return replay;
  await consumeProjectCreateRateLimit(clientIp);

  const now = new Date();
  const projectId = randomUUID();
  const projectRow = {
    id: projectId,
    shareId: createShareId(),
    name: input.name ?? DEFAULT_CLOUD_PROJECT_NAME,
    editTokenHash: hashEditToken(editToken),
    idempotencyKeyHash,
    idempotencyPayloadHash,
    revision: 1,
    createdAt: now,
    updatedAt: now,
  } satisfies typeof projects.$inferInsert;
  const groupRows = input.groups.map((group, index) => ({
    id: randomUUID(),
    projectId,
    clientId: group.clientId,
    name: group.name,
    sortOrder: index,
    note: group.note,
    lastViewedPage: group.lastViewedPage,
    pdfGeneration: 0,
    createdAt: now,
    updatedAt: now,
  })) satisfies (typeof groups.$inferInsert)[];

  try {
    if (groupRows.length > 0) {
      await db.batch([
        db.insert(projects).values(projectRow),
        db.insert(groups).values(groupRows),
      ]);
    } else {
      await db.insert(projects).values(projectRow);
    }
  } catch (error) {
    const concurrentReplay = await resolveReplay();
    if (concurrentReplay) return concurrentReplay;
    throw error;
  }

  return { project: await getCloudProject(projectId), editToken, created: true };
}

export async function renameCloudProject(
  projectId: string,
  name: string,
): Promise<CloudProjectDto> {
  const [updated] = await db
    .update(projects)
    .set({
      name,
      revision: sql`${projects.revision} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(projects.id, projectId))
    .returning({ id: projects.id });
  if (!updated) throw new CloudApiError("PROJECT_NOT_FOUND", "Төсөл олдсонгүй.", 404);
  return getCloudProject(projectId);
}

export async function deleteCloudProject(projectId: string): Promise<void> {
  const now = new Date();
  const result = await db.execute<{ deletedId: string | null }>(sql`
    with locked_project as materialized (
      select ${projects.id}
      from ${projects}
      where ${projects.id} = ${projectId}
      for update
    ), locked_groups as materialized (
      select ${groups.id}
      from ${groups}
      inner join locked_project on locked_project.id = ${groups.projectId}
      for update of ${groups}
    ), paths as materialized (
      select ${pdfFiles.blobPath} as blob_path
      from ${pdfFiles}
      inner join locked_groups on locked_groups.id = ${pdfFiles.groupId}
    ), queued as (
      insert into ${blobDeletionOutbox}
        ("blob_path", "attempt_count", "next_attempt_at", "created_at", "updated_at")
      select paths.blob_path, 0, ${now}, ${now}, ${now}
      from paths
      on conflict ("blob_path") do nothing
      returning "blob_path"
    ), deleted as (
      delete from ${projects}
      where ${projects.id} in (select id from locked_project)
        and (select count(*) from queued) >= 0
        and (select count(*) from locked_groups) >= 0
      returning ${projects.id}
    )
    select (select deleted.id::text from deleted limit 1) as "deletedId"
  `);
  if (!result.rows[0]?.deletedId) {
    throw new CloudApiError("PROJECT_NOT_FOUND", "Төсөл олдсонгүй.", 404);
  }
  await drainBlobDeletionOutbox();
}

export async function createCloudGroup(
  projectId: string,
  input: CreateGroupInput,
): Promise<{ group: CloudGroupDto; created: boolean }> {
  const now = new Date();
  const groupId = randomUUID();
  const result = await db.execute<{
    id: string | null;
    created: boolean;
    atLimit: boolean;
  }>(sql`
    with locked_project as materialized (
      select ${projects.id}
      from ${projects}
      where ${projects.id} = ${projectId}
      for update
    ), stats as materialized (
      select
        locked_project.id as project_id,
        count(${groups.id})::integer as group_count,
        coalesce(max(${groups.sortOrder}), -1)::integer as maximum_sort_order
      from locked_project
      left join ${groups} on ${groups.projectId} = locked_project.id
      group by locked_project.id
    ), inserted as (
      insert into ${groups}
        ("id", "project_id", "client_id", "name", "sort_order", "note",
         "last_viewed_page", "pdf_generation", "created_at", "updated_at")
      select
        ${groupId}::uuid,
        stats.project_id,
        ${input.clientId ?? null}::uuid,
        coalesce(${input.name ?? null}::text, 'Бүлэг ' || (stats.group_count + 1)::text),
        stats.maximum_sort_order + 1,
        ${input.note},
        ${input.lastViewedPage},
        0,
        ${now},
        ${now}
      from stats
      where stats.group_count < ${MAX_GROUPS_PER_PROJECT}
      on conflict ("project_id", "client_id") do nothing
      returning "id"
    ), touched as (
      update ${projects}
      set "revision" = ${projects.revision} + 1,
          "updated_at" = ${now}
      where ${projects.id} = ${projectId}
        and exists (select 1 from inserted)
      returning ${projects.id}
    ), outcome as (
      select inserted.id, true as created, false as at_limit
      from inserted
      union all
      select ${groups.id}, false as created, false as at_limit
      from ${groups}
      where ${groups.projectId} = ${projectId}
        and ${groups.clientId} = ${input.clientId ?? null}::uuid
        and not exists (select 1 from inserted)
      union all
      select null::uuid, false as created, true as at_limit
      from stats
      where stats.group_count >= ${MAX_GROUPS_PER_PROJECT}
        and not exists (select 1 from inserted)
        and not exists (
          select 1 from ${groups}
          where ${groups.projectId} = ${projectId}
            and ${groups.clientId} = ${input.clientId ?? null}::uuid
        )
    )
    select outcome.id::text as id, outcome.created, outcome.at_limit as "atLimit"
    from outcome
    limit 1
  `);
  const outcome = result.rows[0];
  if (!outcome) {
    throw new CloudApiError("PROJECT_NOT_FOUND", "Төсөл олдсонгүй.", 404);
  }
  if (outcome.atLimit) {
    throw new CloudApiError(
      "VALIDATION_ERROR",
      `Нэг төсөл хамгийн ихдээ ${MAX_GROUPS_PER_PROJECT} бүлэгтэй байна.`,
      400,
    );
  }
  if (!outcome.id) {
    throw new CloudApiError("CONFLICT", "Бүлэг үүсгэж чадсангүй.", 409);
  }
  const [row] = await db
    .select({ group: groups, pdf: pdfFiles })
    .from(groups)
    .leftJoin(pdfFiles, eq(pdfFiles.groupId, groups.id))
    .where(and(eq(groups.id, outcome.id), eq(groups.projectId, projectId)))
    .limit(1);
  if (!row) throw new CloudApiError("GROUP_NOT_FOUND", "Бүлэг олдсонгүй.", 404);
  return { group: groupDto(row), created: outcome.created };
}

export async function updateCloudGroup(
  projectId: string,
  groupId: string,
  input: UpdateGroupInput,
): Promise<CloudGroupDto> {
  await assertCloudGroup(projectId, groupId);
  const now = new Date();
  const [, updatedRows] = await db.batch([
    db
      .update(projects)
      .set({ revision: sql`${projects.revision} + 1`, updatedAt: now })
      .where(eq(projects.id, projectId)),
    db
      .update(groups)
      .set({ ...input, updatedAt: now })
      .where(and(eq(groups.id, groupId), eq(groups.projectId, projectId)))
      .returning(),
  ]);
  const updated = updatedRows[0];
  if (!updated) throw new CloudApiError("GROUP_NOT_FOUND", "Бүлэг олдсонгүй.", 404);
  const [pdf] = await db.select().from(pdfFiles).where(eq(pdfFiles.groupId, groupId)).limit(1);
  return groupDto({ group: updated, pdf: pdf ?? null });
}

export async function deleteCloudGroup(projectId: string, groupId: string): Promise<void> {
  const now = new Date();
  const result = await db.execute<{ deletedId: string | null }>(sql`
    with locked_project as materialized (
      select ${projects.id}
      from ${projects}
      where ${projects.id} = ${projectId}
      for update
    ), locked_group as materialized (
      select ${groups.id}
      from ${groups}
      inner join locked_project on locked_project.id = ${groups.projectId}
      where ${groups.id} = ${groupId}
      for update of ${groups}
    ), paths as materialized (
      select ${pdfFiles.blobPath} as blob_path
      from ${pdfFiles}
      inner join locked_group on locked_group.id = ${pdfFiles.groupId}
    ), queued as (
      insert into ${blobDeletionOutbox}
        ("blob_path", "attempt_count", "next_attempt_at", "created_at", "updated_at")
      select paths.blob_path, 0, ${now}, ${now}, ${now}
      from paths
      on conflict ("blob_path") do nothing
      returning "blob_path"
    ), deleted as (
      delete from ${groups}
      where ${groups.id} in (select id from locked_group)
        and (select count(*) from queued) >= 0
      returning ${groups.id}
    ), touched as (
      update ${projects}
      set "revision" = ${projects.revision} + 1,
          "updated_at" = ${now}
      where ${projects.id} = ${projectId}
        and exists (select 1 from deleted)
      returning ${projects.id}
    )
    select (select deleted.id::text from deleted limit 1) as "deletedId",
           (select count(*) from touched)::integer as "touchedCount"
  `);
  if (!result.rows[0]?.deletedId) {
    throw new CloudApiError("GROUP_NOT_FOUND", "Бүлэг олдсонгүй.", 404);
  }
  await drainBlobDeletionOutbox();
}

export async function reorderCloudGroups(
  projectId: string,
  orderedIds: string[],
): Promise<CloudProjectDto> {
  const current = await db
    .select({ id: groups.id })
    .from(groups)
    .where(eq(groups.projectId, projectId))
    .orderBy(asc(groups.sortOrder));
  const currentIds = new Set(current.map((group) => group.id));
  if (
    current.length !== orderedIds.length ||
    orderedIds.some((id) => !currentIds.has(id))
  ) {
    throw new CloudApiError(
      "CONFLICT",
      "Бүлгийн жагсаалт өөрчлөгдсөн байна. Мэдээллээ шинэчлээд дахин оролдоно уу.",
      409,
    );
  }
  if (orderedIds.length === 0) return getCloudProject(projectId);

  const now = new Date();
  const cases = orderedIds.map(
    (id, index) => sql`when ${id}::uuid then ${index}::integer`,
  );
  await db.batch([
    db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.id, projectId))
      .for("update"),
    db
      .update(groups)
      .set({
        sortOrder: sql`${groups.sortOrder} + 1000000`,
      })
      .where(eq(groups.projectId, projectId)),
    db.execute(sql`
      update ${groups}
      set "sort_order" = case ${groups.id} ${sql.join(cases, sql.raw(" "))} end,
          "updated_at" = ${now}
      where ${groups.projectId} = ${projectId}
    `),
    db
      .update(projects)
      .set({ revision: sql`${projects.revision} + 1`, updatedAt: now })
      .where(eq(projects.id, projectId)),
  ]);
  return getCloudProject(projectId);
}

export async function assertCloudGroup(
  projectId: string,
  groupId: string,
): Promise<GroupRow> {
  const [group] = await db
    .select()
    .from(groups)
    .where(and(eq(groups.id, groupId), eq(groups.projectId, projectId)))
    .limit(1);
  if (!group) throw new CloudApiError("GROUP_NOT_FOUND", "Бүлэг олдсонгүй.", 404);
  return group;
}

export async function deleteCloudPdf(projectId: string, groupId: string): Promise<void> {
  const now = new Date();
  const result = await db.execute<{ groupId: string | null }>(sql`
    with locked_project as materialized (
      select ${projects.id}
      from ${projects}
      where ${projects.id} = ${projectId}
      for update
    ), locked_group as materialized (
      select ${groups.id}
      from ${groups}
      inner join locked_project on locked_project.id = ${groups.projectId}
      where ${groups.id} = ${groupId}
      for update of ${groups}
    ), paths as materialized (
      select ${pdfFiles.blobPath} as blob_path
      from ${pdfFiles}
      inner join locked_group on locked_group.id = ${pdfFiles.groupId}
    ), queued as (
      insert into ${blobDeletionOutbox}
        ("blob_path", "attempt_count", "next_attempt_at", "created_at", "updated_at")
      select paths.blob_path, 0, ${now}, ${now}, ${now}
      from paths
      on conflict ("blob_path") do nothing
      returning "blob_path"
    ), deleted_pdf as (
      delete from ${pdfFiles}
      where ${pdfFiles.groupId} in (select id from locked_group)
        and (select count(*) from queued) >= 0
      returning ${pdfFiles.id}
    ), bumped as (
      update ${groups}
      set "pdf_generation" = ${groups.pdfGeneration} + 1,
          "updated_at" = ${now}
      where ${groups.id} in (select id from locked_group)
        and (select count(*) from deleted_pdf) >= 0
      returning ${groups.id}
    ), touched as (
      update ${projects}
      set "revision" = ${projects.revision} + 1,
          "updated_at" = ${now}
      where ${projects.id} = ${projectId}
        and exists (select 1 from bumped)
      returning ${projects.id}
    )
    select (select bumped.id::text from bumped limit 1) as "groupId",
           (select count(*) from touched)::integer as "touchedCount"
  `);
  if (!result.rows[0]?.groupId) {
    throw new CloudApiError("GROUP_NOT_FOUND", "Бүлэг олдсонгүй.", 404);
  }
  await drainBlobDeletionOutbox();
}
