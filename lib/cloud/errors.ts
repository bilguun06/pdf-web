import "server-only";

import {
  BlobAccessError,
  BlobContentTypeNotAllowedError,
  BlobFileTooLargeError,
  BlobServiceNotAvailable,
  BlobServiceRateLimited,
} from "@vercel/blob";

export type CloudErrorCode =
  | "BAD_REQUEST"
  | "INVALID_JSON"
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "PROJECT_NOT_FOUND"
  | "GROUP_NOT_FOUND"
  | "PDF_NOT_FOUND"
  | "CONFLICT"
  | "IDEMPOTENCY_CONFLICT"
  | "RATE_LIMITED"
  | "PAYLOAD_TOO_LARGE"
  | "UNSUPPORTED_MEDIA_TYPE"
  | "INVALID_PDF"
  | "BLOB_UNAVAILABLE"
  | "DATABASE_UNAVAILABLE"
  | "INTERNAL_ERROR";

export class CloudApiError extends Error {
  readonly code: CloudErrorCode;
  readonly status: number;
  readonly fieldErrors?: Record<string, string>;
  readonly headers?: Record<string, string>;

  constructor(
    code: CloudErrorCode,
    message: string,
    status: number,
    options: {
      fieldErrors?: Record<string, string>;
      headers?: Record<string, string>;
      cause?: unknown;
    } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "CloudApiError";
    this.code = code;
    this.status = status;
    this.fieldErrors = options.fieldErrors;
    this.headers = options.headers;
  }
}

function causeChain(error: unknown): unknown[] {
  const chain: unknown[] = [];
  let current = error;
  for (let depth = 0; depth < 5 && current; depth += 1) {
    chain.push(current);
    current =
      typeof current === "object" && "cause" in current
        ? (current as { cause?: unknown }).cause
        : undefined;
  }
  return chain;
}

function postgresCode(error: unknown): string | undefined {
  for (const item of causeChain(error)) {
    if (typeof item === "object" && item && "code" in item) {
      const code = (item as { code?: unknown }).code;
      if (typeof code === "string" && /^\d{5}$/.test(code)) return code;
    }
  }
  return undefined;
}

export function normalizeCloudError(error: unknown): CloudApiError {
  if (error instanceof CloudApiError) return error;

  if (error instanceof BlobFileTooLargeError) {
    return new CloudApiError(
      "PAYLOAD_TOO_LARGE",
      "PDF файл зөвшөөрөгдсөн хэмжээнээс том байна.",
      413,
      { cause: error },
    );
  }
  if (error instanceof BlobContentTypeNotAllowedError) {
    return new CloudApiError(
      "UNSUPPORTED_MEDIA_TYPE",
      "Зөвхөн PDF файл оруулах боломжтой.",
      415,
      { cause: error },
    );
  }
  if (error instanceof BlobServiceRateLimited) {
    return new CloudApiError(
      "BLOB_UNAVAILABLE",
      "Файл хадгалах үйлчилгээ түр ачаалалтай байна. Дахин оролдоно уу.",
      503,
      { cause: error },
    );
  }
  if (error instanceof BlobServiceNotAvailable || error instanceof BlobAccessError) {
    return new CloudApiError(
      "BLOB_UNAVAILABLE",
      "Файл хадгалах үйлчилгээтэй холбогдож чадсангүй.",
      503,
      { cause: error },
    );
  }

  const pgCode = postgresCode(error);
  if (pgCode === "23505" || pgCode === "23503" || pgCode === "40001") {
    return new CloudApiError(
      "CONFLICT",
      "Өөр хүсэлттэй давхцлаа. Мэдээллээ шинэчлээд дахин оролдоно уу.",
      409,
      { cause: error },
    );
  }
  if (pgCode === "23514" || pgCode === "22001" || pgCode === "22P02") {
    return new CloudApiError(
      "VALIDATION_ERROR",
      "Илгээсэн мэдээлэл буруу байна.",
      400,
      { cause: error },
    );
  }
  if (pgCode) {
    return new CloudApiError(
      "DATABASE_UNAVAILABLE",
      "Өгөгдлийн сантай холбогдох үед алдаа гарлаа.",
      503,
      { cause: error },
    );
  }

  return new CloudApiError(
    "INTERNAL_ERROR",
    "Сервер дээр тодорхойгүй алдаа гарлаа.",
    500,
    { cause: error },
  );
}
