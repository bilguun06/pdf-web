import { authorizeProject } from "@/lib/cloud/auth";
import {
  assertSameOrigin,
  handleApiRequest,
  noContentResponse,
} from "@/lib/cloud/http";
import { assertUuid } from "@/lib/cloud/ids";
import { deleteCloudPdf } from "@/lib/cloud/projects";

export const runtime = "nodejs";

type Context = { params: Promise<{ projectId: string; groupId: string }> };

export async function DELETE(request: Request, context: Context): Promise<Response> {
  return handleApiRequest(async () => {
    assertSameOrigin(request);
    const { projectId, groupId } = await context.params;
    const authorized = await authorizeProject(request, projectId);
    const normalizedGroupId = assertUuid(groupId, "groupId");
    await deleteCloudPdf(authorized.id, normalizedGroupId);
    return noContentResponse();
  });
}
