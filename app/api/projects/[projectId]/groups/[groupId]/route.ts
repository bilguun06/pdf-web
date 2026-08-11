import { authorizeProject } from "@/lib/cloud/auth";
import {
  assertSameOrigin,
  dataResponse,
  handleApiRequest,
  noContentResponse,
  readJsonBody,
} from "@/lib/cloud/http";
import { assertUuid } from "@/lib/cloud/ids";
import { deleteCloudGroup, updateCloudGroup } from "@/lib/cloud/projects";
import { parseUpdateGroup } from "@/lib/cloud/validation";

export const runtime = "nodejs";

type Context = { params: Promise<{ projectId: string; groupId: string }> };

export async function PATCH(request: Request, context: Context): Promise<Response> {
  return handleApiRequest(async () => {
    assertSameOrigin(request);
    const { projectId, groupId } = await context.params;
    const authorized = await authorizeProject(request, projectId);
    const normalizedGroupId = assertUuid(groupId, "groupId");
    const input = parseUpdateGroup(await readJsonBody(request));
    const group = await updateCloudGroup(authorized.id, normalizedGroupId, input);
    return dataResponse({ group });
  });
}

export async function DELETE(request: Request, context: Context): Promise<Response> {
  return handleApiRequest(async () => {
    assertSameOrigin(request);
    const { projectId, groupId } = await context.params;
    const authorized = await authorizeProject(request, projectId);
    const normalizedGroupId = assertUuid(groupId, "groupId");
    await deleteCloudGroup(authorized.id, normalizedGroupId);
    return noContentResponse();
  });
}
