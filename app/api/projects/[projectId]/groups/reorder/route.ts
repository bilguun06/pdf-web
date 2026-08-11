import { authorizeProject } from "@/lib/cloud/auth";
import {
  assertSameOrigin,
  dataResponse,
  handleApiRequest,
  readJsonBody,
} from "@/lib/cloud/http";
import { reorderCloudGroups } from "@/lib/cloud/projects";
import { parseReorderGroups } from "@/lib/cloud/validation";

export const runtime = "nodejs";

type Context = { params: Promise<{ projectId: string }> };

export async function PUT(request: Request, context: Context): Promise<Response> {
  return handleApiRequest(async () => {
    assertSameOrigin(request);
    const { projectId } = await context.params;
    const authorized = await authorizeProject(request, projectId);
    const groupIds = parseReorderGroups(await readJsonBody(request));
    const project = await reorderCloudGroups(authorized.id, groupIds);
    return dataResponse({ project });
  });
}
