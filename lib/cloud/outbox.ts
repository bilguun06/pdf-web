import "server-only";

import { del } from "@vercel/blob";
import {
  and,
  asc,
  eq,
  inArray,
  isNotNull,
  isNull,
  lte,
  notExists,
} from "drizzle-orm";

import { db } from "@/db";
import { blobDeletionOutbox, pdfFiles } from "@/db/schema";

const MAX_DRAIN_BATCH = 10;
const MAX_PURGE_BATCH = 1_000;
const COMPLETED_TOMBSTONE_RETENTION_MS = 30 * 24 * 60 * 60 * 1_000;

export interface BlobDeletionDrainResult {
  selected: number;
  deleted: number;
  deferred: number;
  failed: number;
}

export async function enqueueBlobDeletion(blobPath: string): Promise<void> {
  const now = new Date();
  await db
    .insert(blobDeletionOutbox)
    .values({ blobPath, nextAttemptAt: now, createdAt: now, updatedAt: now })
    .onConflictDoNothing({ target: blobDeletionOutbox.blobPath });
}

function retryDelayMs(attemptCount: number): number {
  return Math.min(24 * 60 * 60 * 1_000, 60_000 * 2 ** Math.min(attemptCount, 10));
}

function safeDeletionError(error: unknown): string {
  const name = error instanceof Error ? error.name : "UnknownError";
  return `Blob deletion failed (${name.slice(0, 120)}).`;
}

export async function drainBlobDeletionOutbox(
  limit = MAX_DRAIN_BATCH,
): Promise<BlobDeletionDrainResult> {
  const boundedLimit = Math.max(1, Math.min(limit, MAX_DRAIN_BATCH));
  const due = await db
    .select()
    .from(blobDeletionOutbox)
    .where(
      and(
        isNull(blobDeletionOutbox.completedAt),
        lte(blobDeletionOutbox.nextAttemptAt, new Date()),
      ),
    )
    .orderBy(asc(blobDeletionOutbox.nextAttemptAt), asc(blobDeletionOutbox.createdAt))
    .limit(boundedLimit);

  const result: BlobDeletionDrainResult = {
    selected: due.length,
    deleted: 0,
    deferred: 0,
    failed: 0,
  };

  for (const item of due) {
    const [active] = await db
      .select({ id: pdfFiles.id })
      .from(pdfFiles)
      .where(eq(pdfFiles.blobPath, item.blobPath))
      .limit(1);

    if (active) {
      await db
        .update(blobDeletionOutbox)
        .set({
          nextAttemptAt: new Date(Date.now() + 60 * 60 * 1_000),
          lastError: "Deletion deferred because the Blob is still active.",
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(blobDeletionOutbox.blobPath, item.blobPath),
            isNull(blobDeletionOutbox.completedAt),
          ),
        );
      result.deferred += 1;
      continue;
    }

    try {
      // The durable tombstone remains present while this network call runs, so
      // upload completion cannot reactivate a path that is being removed.
      await del(item.blobPath);
      const completedAt = new Date();
      await db
        .update(blobDeletionOutbox)
        .set({ completedAt, lastError: null, updatedAt: completedAt })
        .where(
          and(
            eq(blobDeletionOutbox.blobPath, item.blobPath),
            isNull(blobDeletionOutbox.completedAt),
          ),
        );
      result.deleted += 1;
    } catch (error) {
      const attemptCount = item.attemptCount + 1;
      const updatedAt = new Date();
      await db
        .update(blobDeletionOutbox)
        .set({
          attemptCount,
          nextAttemptAt: new Date(updatedAt.getTime() + retryDelayMs(attemptCount)),
          lastError: safeDeletionError(error),
          updatedAt,
        })
        .where(
          and(
            eq(blobDeletionOutbox.blobPath, item.blobPath),
            isNull(blobDeletionOutbox.completedAt),
          ),
        );
      result.failed += 1;
    }
  }

  return result;
}

export async function purgeCompletedBlobDeletionOutbox(
  limit = MAX_PURGE_BATCH,
  completedBefore = new Date(Date.now() - COMPLETED_TOMBSTONE_RETENTION_MS),
): Promise<number> {
  const boundedLimit = Math.max(1, Math.min(limit, MAX_PURGE_BATCH));
  const purgeCandidates = db
    .select({ blobPath: blobDeletionOutbox.blobPath })
    .from(blobDeletionOutbox)
    .where(
      and(
        isNotNull(blobDeletionOutbox.completedAt),
        lte(blobDeletionOutbox.completedAt, completedBefore),
        notExists(
          db
            .select({ id: pdfFiles.id })
            .from(pdfFiles)
            .where(eq(pdfFiles.blobPath, blobDeletionOutbox.blobPath)),
        ),
      ),
    )
    .orderBy(
      asc(blobDeletionOutbox.completedAt),
      asc(blobDeletionOutbox.createdAt),
    )
    .limit(boundedLimit);

  const purged = await db
    .delete(blobDeletionOutbox)
    .where(inArray(blobDeletionOutbox.blobPath, purgeCandidates))
    .returning({ blobPath: blobDeletionOutbox.blobPath });

  return purged.length;
}

export async function enqueueAndDrainBlobDeletion(blobPath: string): Promise<void> {
  await enqueueBlobDeletion(blobPath);
  await drainBlobDeletionOutbox();
}
