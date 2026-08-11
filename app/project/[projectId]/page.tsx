import { notFound } from "next/navigation";

import { CloudProjectEditor } from "@/components/cloud/CloudProjectEditor";

const PROJECT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export default async function CloudProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  if (!PROJECT_ID_PATTERN.test(projectId)) notFound();
  return <CloudProjectEditor projectId={projectId} />;
}
