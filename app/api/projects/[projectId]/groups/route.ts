import { authorizeProject } from "@/lib/cloud/auth";
import {
  assertSameOrigin,
  dataResponse,
  handleApiRequest,
  readJsonBody,
} from "@/lib/cloud/http";
import { createCloudGroup } from "@/lib/cloud/projects";
import { parseCreateGroup } from "@/lib/cloud/validation";

export const runtime = "nodejs";

type Context = { params: Promise<{ projectId: string }> };

export async function POST(request: Request, context: Context): Promise<Response> {
  return handleApiRequest(async () => {
    assertSameOrigin(request);
    const { projectId } = await context.params;
    const authorized = await authorizeProject(request, projectId);
    const input = parseCreateGroup(await readJsonBody(request));
    const { group, created } = await createCloudGroup(authorized.id, input);
    return dataResponse({ group }, created ? 201 : 200);
  });
}
