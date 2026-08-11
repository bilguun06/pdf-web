import "server-only";

import { lt, sql } from "drizzle-orm";
import { isIP } from "node:net";

import { db } from "@/db";
import { rateLimitBuckets } from "@/db/schema";
import {
  BLOB_RATE_LIMIT_MIB_BYTES,
  BLOB_TOKEN_RATE_LIMIT_PER_PROJECT,
  BLOB_TOKEN_RATE_LIMIT_PER_IP,
  BLOB_UPLOAD_RATE_LIMIT_GLOBAL_MIB,
  BLOB_UPLOAD_RATE_LIMIT_PER_IP_MIB,
  PROJECT_CREATE_RATE_LIMIT,
  RATE_LIMIT_WINDOW_MS,
} from "@/lib/cloud/constants";
import { CloudApiError } from "@/lib/cloud/errors";
import { hashRateLimitKey } from "@/lib/cloud/ids";

type RateLimitScope =
  | "project-create-ip"
  | "blob-token-project"
  | "blob-token-ip"
  | "blob-byte-ip"
  | "blob-byte-global";

interface BlobUploadRateLimitInput {
  projectId: string;
  clientIp: string;
  fileSize: number;
}

function canonicalizeIp(value: string): string | null {
  const ip = value.trim();
  const version = isIP(ip);
  if (version === 4) {
    return ip
      .split(".")
      .map((part) => String(Number(part)))
      .join(".");
  }
  if (version === 6) {
    try {
      const hostname = new URL(`http://[${ip}]/`).hostname;
      return hostname.slice(1, -1).toLowerCase();
    } catch {
      return null;
    }
  }
  return null;
}

export function trustedForwardedClientIp(request: Request): string {
  // Vercel normalizes/sets this proxy header at the deployment boundary. Raw
  // addresses are used only in memory and are HMACed before any DB write.
  const forwarded = request.headers.get("x-forwarded-for");
  const firstHop = forwarded?.split(",", 1)[0];
  return (firstHop && canonicalizeIp(firstHop)) ?? "unknown";
}

async function consumeRateLimit(
  scope: RateLimitScope,
  rawKey: string,
  maximum: number,
): Promise<void> {
  const nowMs = Date.now();
  const windowStartMs = Math.floor(nowMs / RATE_LIMIT_WINDOW_MS) * RATE_LIMIT_WINDOW_MS;
  const windowStart = new Date(windowStartMs);
  const now = new Date(nowMs);
  const staleBefore = new Date(windowStartMs - RATE_LIMIT_WINDOW_MS);
  const keyHash = hashRateLimitKey(scope, rawKey);

  const [, rows] = await db.batch([
    db.delete(rateLimitBuckets).where(lt(rateLimitBuckets.windowStart, staleBefore)),
    db
      .insert(rateLimitBuckets)
      .values({ scope, keyHash, windowStart, requestCount: 1, updatedAt: now })
      .onConflictDoUpdate({
        target: [
          rateLimitBuckets.scope,
          rateLimitBuckets.keyHash,
          rateLimitBuckets.windowStart,
        ],
        set: {
          requestCount: sql`${rateLimitBuckets.requestCount} + 1`,
          updatedAt: now,
        },
      })
      .returning({ requestCount: rateLimitBuckets.requestCount }),
  ] as const);

  const count = rows[0]?.requestCount ?? maximum + 1;
  if (count > maximum) {
    const retryAfter = Math.max(
      1,
      Math.ceil((windowStartMs + RATE_LIMIT_WINDOW_MS - nowMs) / 1_000),
    );
    throw new CloudApiError(
      "RATE_LIMITED",
      "Хүсэлтийн хязгаарт хүрсэн байна. Түр хүлээгээд дахин оролдоно уу.",
      429,
      { headers: { "Retry-After": String(retryAfter) } },
    );
  }
}

export async function consumeProjectCreateRateLimit(
  clientIp: string,
): Promise<void> {
  await consumeRateLimit("project-create-ip", clientIp, PROJECT_CREATE_RATE_LIMIT);
}

export async function consumeBlobTokenRateLimit(projectId: string): Promise<void> {
  await consumeRateLimit(
    "blob-token-project",
    projectId,
    BLOB_TOKEN_RATE_LIMIT_PER_PROJECT,
  );
}

function hasPostgresCode(error: unknown, expectedCode: string): boolean {
  let current = error;
  for (let depth = 0; depth < 6 && current; depth += 1) {
    if (
      typeof current === "object" &&
      "code" in current &&
      (current as { code?: unknown }).code === expectedCode
    ) {
      return true;
    }
    current =
      typeof current === "object" && "cause" in current
        ? (current as { cause?: unknown }).cause
        : undefined;
  }
  return false;
}

/**
 * Atomically reserves all upload-token and declared-byte budgets.
 *
 * Neon HTTP's `db.batch` executes as one transaction. The final assertion
 * deliberately raises PostgreSQL 22012 when any counter exceeds its limit;
 * that rolls every bucket increment back, avoiding partial per-IP/global
 * consumption under concurrent requests.
 */
export async function consumeBlobUploadRateLimits({
  projectId,
  clientIp,
  fileSize,
}: BlobUploadRateLimitInput): Promise<void> {
  const nowMs = Date.now();
  const windowStartMs = Math.floor(nowMs / RATE_LIMIT_WINDOW_MS) * RATE_LIMIT_WINDOW_MS;
  const windowStart = new Date(windowStartMs);
  const now = new Date(nowMs);
  const staleBefore = new Date(windowStartMs - RATE_LIMIT_WINDOW_MS);
  const byteUnits = Math.max(1, Math.ceil(fileSize / BLOB_RATE_LIMIT_MIB_BYTES));

  const projectTokenKey = hashRateLimitKey("blob-token-project", projectId);
  const ipTokenKey = hashRateLimitKey("blob-token-ip", clientIp);
  const ipByteKey = hashRateLimitKey("blob-byte-ip", clientIp);
  const globalByteKey = hashRateLimitKey("blob-byte-global", "deployment");
  const buckets = [
    {
      scope: "blob-token-project" as const,
      keyHash: projectTokenKey,
      windowStart,
      requestCount: 1,
      updatedAt: now,
    },
    {
      scope: "blob-token-ip" as const,
      keyHash: ipTokenKey,
      windowStart,
      requestCount: 1,
      updatedAt: now,
    },
    {
      scope: "blob-byte-ip" as const,
      keyHash: ipByteKey,
      windowStart,
      requestCount: byteUnits,
      updatedAt: now,
    },
    {
      scope: "blob-byte-global" as const,
      keyHash: globalByteKey,
      windowStart,
      requestCount: byteUnits,
      updatedAt: now,
    },
  ];

  try {
    await db.batch([
      db.delete(rateLimitBuckets).where(lt(rateLimitBuckets.windowStart, staleBefore)),
      db
        .insert(rateLimitBuckets)
        .values(buckets)
        .onConflictDoUpdate({
          target: [
            rateLimitBuckets.scope,
            rateLimitBuckets.keyHash,
            rateLimitBuckets.windowStart,
          ],
          set: {
            requestCount: sql`${rateLimitBuckets.requestCount} + excluded."request_count"`,
            updatedAt: now,
          },
        }),
      db.execute(sql`
        with limits(scope, key_hash, maximum) as (
          values
            ('blob-token-project', ${projectTokenKey}::text, ${BLOB_TOKEN_RATE_LIMIT_PER_PROJECT}::integer),
            ('blob-token-ip', ${ipTokenKey}::text, ${BLOB_TOKEN_RATE_LIMIT_PER_IP}::integer),
            ('blob-byte-ip', ${ipByteKey}::text, ${BLOB_UPLOAD_RATE_LIMIT_PER_IP_MIB}::integer),
            ('blob-byte-global', ${globalByteKey}::text, ${BLOB_UPLOAD_RATE_LIMIT_GLOBAL_MIB}::integer)
        )
        select 1 / case
          when count(*) = 4
            and bool_and(${rateLimitBuckets.requestCount} <= limits.maximum)
          then 1
          else 0
        end as accepted
        from limits
        inner join ${rateLimitBuckets}
          on ${rateLimitBuckets.scope} = limits.scope
         and ${rateLimitBuckets.keyHash} = limits.key_hash
         and ${rateLimitBuckets.windowStart} = ${windowStart}
      `),
    ] as const);
  } catch (error) {
    if (!hasPostgresCode(error, "22012")) throw error;
    const retryAfter = Math.max(
      1,
      Math.ceil((windowStartMs + RATE_LIMIT_WINDOW_MS - nowMs) / 1_000),
    );
    throw new CloudApiError(
      "RATE_LIMITED",
      "Upload-ийн цагийн хэмжээ эсвэл хүсэлтийн хязгаарт хүрсэн байна. Түр хүлээгээд дахин оролдоно уу.",
      429,
      { headers: { "Retry-After": String(retryAfter) } },
    );
  }
}
