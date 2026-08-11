import { CloudApiError } from "@/lib/cloud/errors";
import { dataResponse, handleApiRequest } from "@/lib/cloud/http";
import { isShareId } from "@/lib/cloud/ids";
import { getSharedProject } from "@/lib/cloud/projects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ shareId: string }> };

export async function GET(_request: Request, context: Context): Promise<Response> {
  return handleApiRequest(async () => {
    const { shareId } = await context.params;
    if (!isShareId(shareId)) {
      throw new CloudApiError(
        "PROJECT_NOT_FOUND",
        "Төсөл олдсонгүй. Холбоос буруу эсвэл төсөл устгагдсан байна.",
        404,
      );
    }
    const project = await getSharedProject(shareId);
    return dataResponse({ project });
  });
}
