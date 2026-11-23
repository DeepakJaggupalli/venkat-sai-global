import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requireStaff } from "@/modules/identity/authz";
import { getRequirementCriteria } from "@/modules/operations/cv-matching";

import { MatchesView } from "../../_components/matches-view";

export const metadata: Metadata = { title: "Matching CVs" };

/** CVs and candidate profiles matching an operations requirement's roles (requirements.view + candidates.view). */
export default async function RequirementMatchesPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireStaff(["requirements.view", "candidates.view"]);
  const { id } = await params;
  const criteria = await getRequirementCriteria(ctx, id);
  if (!criteria) notFound();
  return (
    <MatchesView
      ctx={ctx}
      criteria={criteria}
      breadcrumb={[{ label: "Requirements", href: "/admin/requirements" }, { label: criteria.code ?? criteria.title, href: `/admin/requirements/${criteria.ref.id}` }, { label: "Matching CVs" }]}
      back={{ href: `/admin/requirements/${criteria.ref.id}`, label: "Back to requirement" }}
    />
  );
}
