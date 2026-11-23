import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requireStaff } from "@/modules/identity/authz";
import { getPosterCriteria } from "@/modules/operations/cv-matching";

import { MatchesView } from "../../../_components/matches-view";

export const metadata: Metadata = { title: "Matching CVs" };

/** CVs and candidate profiles matching a requirement poster's trades (content.view + candidates.view). */
export default async function PosterMatchesPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireStaff(["content.view", "candidates.view"]);
  const { id } = await params;
  const criteria = await getPosterCriteria(ctx, id);
  if (!criteria) notFound();
  return (
    <MatchesView
      ctx={ctx}
      criteria={criteria}
      breadcrumb={[{ label: "Requirement posters", href: "/admin/requirements/posters" }, { label: criteria.title }]}
      back={{ href: "/admin/requirements/posters", label: "Back to posters" }}
      editHref={`/admin/content/requirement_posts/${criteria.ref.id}`}
    />
  );
}
