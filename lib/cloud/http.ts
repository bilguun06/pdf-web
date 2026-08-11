import "server-only";

import { CloudApiError, normalizeCloudError } from "@/lib/cloud/errors";
import { MAX_JSON_BODY_BYTES } from "@/lib/cloud/constants";
import { drainBlobDeletionOutbox } from "@/lib/cloud/outbox";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
} as const;

export function dataResponse<T>(data: T, status = 200): Response {
  return Response.json(
    { data },
    { status, headers: NO_STORE_HEADERS },
  );
}

export function noContentResponse(): Response {
  return new Response(null, { status: 204, headers: NO_STORE_HEADERS });
}

export function rawJsonResponse(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: NO_STORE_HEADERS });
}

export async function handleApiRequest(
  operation: () => Promise<Response>,
): Promise<Response> {
  try {
    const response = await operation();
    await drainBlobDeletionOutbox(2).catch((error) => {
      console.error("[cloud-api:blob-outbox] Opportunistic cleanup failed.", error);
    });
    return response;
  } catch (caught) {
    const requestId = crypto.randomUUID();
    const error = normalizeCloudError(caught);

    if (error.status >= 500) {
      console.error(`[cloud-api:${requestId}] ${error.code}`, caught);
    }

    const headers = new Headers(NO_STORE_HEADERS);
    for (const [name, value] of Object.entries(error.headers ?? {})) {
      headers.set(name, value);
    }

    return Response.json(
      {
        error: {
          code: error.code,
          message: error.message,
          requestId,
          ...(error.fieldErrors ? { fieldErrors: error.fieldErrors } : {}),
        },
      },
      { status: error.status, headers },
    );
  }
}

export function assertSameOrigin(request: Request): void {
  const secFetchSite = request.headers.get("sec-fetch-site");
  if (secFetchSite === "cross-site") {
    throw new CloudApiError("FORBIDDEN", "Хүсэлтийн эх сурвалж зөвшөөрөгдөөгүй.", 403);
  }

  const origin = request.headers.get("origin");
  if (!origin) return;

  let requestOrigin: string;
  try {
    requestOrigin = new URL(request.url).origin;
  } catch {
    throw new CloudApiError("BAD_REQUEST", "Хүсэлтийн URL буруу байна.", 400);
  }
  if (origin !== requestOrigin) {
    throw new CloudApiError("FORBIDDEN", "Хүсэлтийн эх сурвалж зөвшөөрөгдөөгүй.", 403);
  }
}

export async function readJsonBody(
  request: Request,
  maxBytes = MAX_JSON_BODY_BYTES,
): Promise<unknown> {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim();
  if (contentType !== "application/json") {
    throw new CloudApiError(
      "UNSUPPORTED_MEDIA_TYPE",
      "Content-Type нь application/json байх ёстой.",
      415,
    );
  }

  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new CloudApiError("PAYLOAD_TOO_LARGE", "Хүсэлтийн хэмжээ хэт том байна.", 413);
  }

  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) {
    throw new CloudApiError("PAYLOAD_TOO_LARGE", "Хүсэлтийн хэмжээ хэт том байна.", 413);
  }
  if (!text.trim()) {
    throw new CloudApiError("INVALID_JSON", "JSON хүсэлт хоосон байна.", 400);
  }

  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new CloudApiError("INVALID_JSON", "JSON хүсэлт буруу байна.", 400, {
      cause: error,
    });
  }
}
