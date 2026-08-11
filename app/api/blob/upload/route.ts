import type { HandleUploadBody } from "@vercel/blob/client";

import { handleBlobUpload } from "@/lib/cloud/blob";
import { CloudApiError } from "@/lib/cloud/errors";
import {
  handleApiRequest,
  rawJsonResponse,
  readJsonBody,
} from "@/lib/cloud/http";

export const runtime = "nodejs";

function asHandleUploadBody(value: unknown): HandleUploadBody {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new CloudApiError("BAD_REQUEST", "Blob хүсэлт буруу байна.", 400);
  }
  const type = (value as { type?: unknown }).type;
  if (type !== "blob.generate-client-token" && type !== "blob.upload-completed") {
    throw new CloudApiError("BAD_REQUEST", "Blob хүсэлтийн төрөл буруу байна.", 400);
  }
  return value as HandleUploadBody;
}

export async function POST(request: Request): Promise<Response> {
  return handleApiRequest(async () => {
    const body = asHandleUploadBody(await readJsonBody(request, 64 * 1024));
    const result = await handleBlobUpload(request, body);
    return rawJsonResponse(result);
  });
}
