import { authorizeProject } from "@/lib/cloud/auth";
import {
  assertSameOrigin,
  dataResponse,
  handleApiRequest,
  noContentResponse,
  readJsonBody,
} from "@/lib/cloud/http";
import {
  deleteCloudProject,
  getCloudProject,
  renameCloudProject,
} from "@/lib/cloud/projects";
import { parseUpdateProject } from "@/lib/cloud/validation";

export const runtime = "nodejs";

type Context = { params: Promise<{ projectId: string }> };

export async function GET(request: Request, context: Context): Promise<Response> {
  return handleApiRequest(async () => {
    const { projectId } = await context.params;
    const authorized = await authorizeProject(request, projectId);
    const project = await getCloudProject(authorized.id);
    return dataResponse({ project });
  });
}

export async function PATCH(request: Request, context: Context): Promise<Response> {
  return handleApiRequest(async () => {
    assertSameOrigin(request);
    const { projectId } = await context.params;
    const authorized = await authorizeProject(request, projectId);
    const input = parseUpdateProject(await readJsonBody(request));
    const project = await renameCloudProject(authorized.id, input.name);
    return dataResponse({ project });
  });
}

export async function DELETE(request: Request, context: Context): Promise<Response> {
  return handleApiRequest(async () => {
    assertSameOrigin(request);
    const { projectId } = await context.params;
    const authorized = await authorizeProject(request, projectId);
    await deleteCloudProject(authorized.id);
    return noContentResponse();
  });
}
