import "server-only";

import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import {
  EDIT_TOKEN_PATTERN,
  IDEMPOTENCY_KEY_PATTERN,
  SHARE_ID_PATTERN,
  UUID_PATTERN,
} from "@/lib/cloud/constants";
import { CloudApiError } from "@/lib/cloud/errors";

export function createShareId(): string {
  return `p_${randomBytes(16).toString("base64url")}`;
}

export function createEditToken(): string {
  return `e_${randomBytes(32).toString("base64url")}`;
}

function domainHmac(domain: string, value: string): Buffer {
  return createHmac("sha256", editTokenPepper())
    .update(domain, "utf8")
    .update("\0", "utf8")
    .update(value, "utf8")
    .digest();
}

export function createIdempotentEditToken(idempotencyKey: string): string {
  return `e_${domainHmac("project-edit-token-v1", idempotencyKey).toString("base64url")}`;
}

export function hashIdempotencyKey(idempotencyKey: string): string {
  return domainHmac("project-idempotency-key-v1", idempotencyKey).toString("hex");
}

export function hashRateLimitKey(scope: string, value: string): string {
  return domainHmac(`rate-limit-v1:${scope}`, value).toString("hex");
}

export function hashCanonicalPayload(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function editTokenPepper(): string {
  const value = process.env.EDIT_TOKEN_PEPPER;
  if (!value || value.length < 32) {
    throw new CloudApiError(
      "INTERNAL_ERROR",
      "Серверийн нууц түлхүүр тохируулаагүй байна.",
      500,
    );
  }
  return value;
}

export function hashEditToken(token: string): string {
  return createHmac("sha256", editTokenPepper()).update(token, "utf8").digest("hex");
}

export function editTokenMatches(token: string, expectedHash: string): boolean {
  if (!EDIT_TOKEN_PATTERN.test(token) || !/^[0-9a-f]{64}$/.test(expectedHash)) {
    return false;
  }
  const actual = Buffer.from(hashEditToken(token), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export function isShareId(value: string): boolean {
  return SHARE_ID_PATTERN.test(value);
}

export function assertUuid(value: string, fieldName: string): string {
  if (!isUuid(value)) {
    throw new CloudApiError(
      "VALIDATION_ERROR",
      `${fieldName} утга буруу байна.`,
      400,
      { fieldErrors: { [fieldName]: "UUID утга буруу байна." } },
    );
  }
  return value.toLowerCase();
}

export function assertUuidV4(value: string, fieldName: string): string {
  if (!IDEMPOTENCY_KEY_PATTERN.test(value)) {
    throw new CloudApiError(
      "VALIDATION_ERROR",
      `${fieldName} утга буруу байна.`,
      400,
      { fieldErrors: { [fieldName]: "Canonical UUID version 4 утга шаардлагатай." } },
    );
  }
  return value.toLowerCase();
}

export function assertIdempotencyKey(value: string | null): string {
  if (!value || !IDEMPOTENCY_KEY_PATTERN.test(value)) {
    throw new CloudApiError(
      "VALIDATION_ERROR",
      "Idempotency-Key header нь crypto.randomUUID() утгатай байх ёстой.",
      400,
      {
        fieldErrors: {
          "Idempotency-Key": "Canonical UUID version 4 утга шаардлагатай.",
        },
      },
    );
  }
  return value.toLowerCase();
}
