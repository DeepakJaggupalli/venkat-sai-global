import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatNumber } from "@/lib/format";
import { requireStaff } from "@/modules/identity/authz";

import { SETTINGS_CRUMB, SettingsNav } from "../_components/settings-nav";
import { TAXONOMIES, TAXONOMY_KINDS } from "./_lib/config";
import { taxonomyCounts } from "./_lib/queries";

export const metadata: Metadata = { title: "Taxonomies" };

export default async function TaxonomiesPage() {
  await requireStaff("settings.view");
  const counts = await taxonomyCounts();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Taxonomies"
        description="Reference lists used in forms, filters and search across every portal. Records are deactivated rather than deleted, because profiles, jobs and courses refer to them."
        breadcrumbs={[{ label: "Command Centre", href: "/admin" }, SETTINGS_CRUMB, { label: "Taxonomies" }]}
      />
      <SettingsNav />
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label="Reference lists">
        {TAXONOMY_KINDS.map((kind) => {
          const cfg = TAXONOMIES[kind];
          return (
            <li key={kind}>
              <Link
                href={`/admin/settings/taxonomies/${kind}`}
                className="flex h-full flex-col gap-2 rounded-xl border bg-card p-5 transition-colors hover:border-teal hover:bg-teal-soft/40 focus-visible:outline-2 focus-visible:outline-offset-2"
                data-testid={`taxonomy-${kind}`}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="font-heading text-base font-semibold text-foreground">{cfg.title}</span>
                  <span className="text-sm tabular-nums text-muted-foreground">{formatNumber(counts[kind])}</span>
                </span>
                <span className="line-clamp-3 text-sm text-muted-foreground">{cfg.description}</span>
                {kind === "skills" && counts.pendingSkills > 0 ? (
                  <StatusBadge tone="warning" size="sm" className="self-start">
                    {counts.pendingSkills} suggestion{counts.pendingSkills === 1 ? "" : "s"} to review
                  </StatusBadge>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
