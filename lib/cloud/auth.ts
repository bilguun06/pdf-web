import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { projects, type ProjectRow } from "@/db/schema";
import { EDIT_TOKEN_PATTERN } from "@/lib/cloud/constants";
import { CloudApiError } from "@/lib/cloud/errors";
import { assertUuid, editTokenMatches } from "@/lib/cloud/ids";

export function readBearerEditToken(request: Request): string {
  const authorization = request.headers.get("authorization");
  const match = authorization?.match(/^Bearer ([^\s]+)$/);
  const token = match?.[1];
  if (!token || !EDIT_TOKEN_PATTERN.test(token)) {
    throw new CloudApiError(
      "UNAUTHORIZED",
      "Засварлах эрхийн token дутуу эсвэл буруу байна.",
      401,
    );
  }
  return token;
}

export async function authorizeProject(
  request: Request,
  rawProjectId: string,
): Promise<ProjectRow> {
  const projectId = assertUuid(rawProjectId, "projectId");
  const token = readBearerEditToken(request);
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);

  if (!project) {
    throw new CloudApiError("PROJECT_NOT_FOUND", "Төсөл олдсонгүй.", 404);
  }
  if (!editTokenMatches(token, project.editTokenHash)) {
    throw new CloudApiError(
      "UNAUTHORIZED",
      "Засварлах эрхийн token буруу байна.",
      401,
    );
  }
  return project;
}
