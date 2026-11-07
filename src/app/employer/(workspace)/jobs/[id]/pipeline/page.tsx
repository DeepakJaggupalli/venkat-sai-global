import { redirect } from "next/navigation";

import type { SearchParams } from "@/lib/http";
import { requireOrgMember } from "@/modules/identity/authz";

/** The canonical per-job pipeline lives at /employer/pipeline/[jobId]; keep ?application= when redirecting. */
export default async function JobPipelineRedirect({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> }) {
  await requireOrgMember("employer", "employer.pipeline.view");
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const application = typeof sp.application === "string" ? sp.application : null;
  redirect(`/employer/pipeline/${encodeURIComponent(id)}${application ? `?application=${encodeURIComponent(application)}` : ""}`);
}
