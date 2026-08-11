import { createHash, timingSafeEqual } from "node:crypto";

import {
  drainBlobDeletionOutbox,
  purgeCompletedBlobDeletionOutbox,
} from "@/lib/cloud/outbox";

export const maxDuration = 60;

const DRAIN_BATCH_SIZE = 10;
const MAX_DRAIN_BATCHES = 4;
const DRAIN_TIME_BUDGET_MS = 40_000;

const RESPONSE_HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
} as const;

function sha256(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

function hasValidCronAuthorization(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) return false;

  const authorization = request.headers.get("authorization") ?? "";
  return timingSafeEqual(
    sha256(authorization),
    sha256(`Bearer ${secret}`),
  );
}

export async function GET(request: Request): Promise<Response> {
  if (!hasValidCronAuthorization(request)) {
    return Response.json(
      { ok: false },
      { status: 401, headers: RESPONSE_HEADERS },
    );
  }

  const startedAt = Date.now();
  const summary = {
    selected: 0,
    deleted: 0,
    deferred: 0,
    failed: 0,
    purged: 0,
    batches: 0,
    capped: false,
  };

  try {
    for (let batch = 0; batch < MAX_DRAIN_BATCHES; batch += 1) {
      if (Date.now() - startedAt >= DRAIN_TIME_BUDGET_MS) {
        summary.capped = true;
        break;
      }

      const result = await drainBlobDeletionOutbox(DRAIN_BATCH_SIZE);
      summary.selected += result.selected;
      summary.deleted += result.deleted;
      summary.deferred += result.deferred;
      summary.failed += result.failed;
      summary.batches += 1;

      if (result.selected < DRAIN_BATCH_SIZE) break;
      if (batch === MAX_DRAIN_BATCHES - 1) summary.capped = true;
    }

    summary.purged = await purgeCompletedBlobDeletionOutbox();

    return Response.json(
      { ok: true, cleanup: summary },
      { headers: RESPONSE_HEADERS },
    );
  } catch (error) {
    const requestId = crypto.randomUUID();
    const errorName = error instanceof Error ? error.name : "UnknownError";
    console.error(
      `[blob-cleanup-cron:${requestId}] Cleanup failed (${errorName}).`,
    );

    return Response.json(
      { ok: false, requestId },
      { status: 500, headers: RESPONSE_HEADERS },
    );
  }
}
