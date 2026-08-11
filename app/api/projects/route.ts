import { createCloudProject } from "@/lib/cloud/projects";
import { assertSameOrigin, dataResponse, handleApiRequest, readJsonBody } from "@/lib/cloud/http";
import { assertIdempotencyKey } from "@/lib/cloud/ids";
import { trustedForwardedClientIp } from "@/lib/cloud/rate-limit";
import { parseCreateProject } from "@/lib/cloud/validation";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  return handleApiRequest(async () => {
    assertSameOrigin(request);
    const idempotencyKey = assertIdempotencyKey(
      request.headers.get("idempotency-key"),
    );
    const input = parseCreateProject(await readJsonBody(request));
    const { project, editToken, created } = await createCloudProject(
      input,
      idempotencyKey,
      trustedForwardedClientIp(request),
    );
    const origin = new URL(request.url).origin;
    return dataResponse(
      {
        project,
        editToken,
        editorUrl: `${origin}/project/${project.id}#token=${encodeURIComponent(editToken)}`,
        shareUrl: `${origin}/share/${project.shareId}`,
      },
      created ? 201 : 200,
    );
  });
}
