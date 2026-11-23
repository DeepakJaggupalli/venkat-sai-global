import { ExternalLink, Users } from "lucide-react";

import { PortalBreadcrumb } from "@/components/layout/portal-breadcrumb";
import { Callout } from "@/components/shared/callout";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { staffCan, type StaffContext } from "@/modules/identity/authz";
import { canContactMatches, findMatches, MATCH_LIMIT, type MatchCriteria } from "@/modules/operations/cv-matching";

import { MatchList, type MatchRow } from "./match-list";

/** "Matching CVs" page body shared by requirement posters and operations requirements. */
export async function MatchesView({ ctx, criteria, breadcrumb, back, editHref }: { ctx: StaffContext; criteria: MatchCriteria; breadcrumb: { label: string; href?: string }[]; back: { href: string; label: string }; editHref?: string }) {
  const result = await findMatches(ctx, criteria);
  const rows: MatchRow[] = result.items.map((m) => ({
    kind: m.kind,
    id: m.id,
    code: m.code,
    name: m.name,
    trade: m.trade,
    experienceYears: m.experienceYears,
    countryName: m.countryName,
    prefersTargetCountry: m.prefersTargetCountry,
    status: m.status,
    phoneMasked: m.phoneMasked,
    hasPhone: m.hasPhone,
    createdAt: m.createdAt.toISOString(),
    reason: m.reason,
  }));
  const total = result.items.length;
  const trades = criteria.trades.length ? criteria.trades.join(", ") : "No trades listed";

  return (
    <div className="space-y-6">
      <PortalBreadcrumb items={breadcrumb} />
      <PageHeader
        eyebrow={criteria.code ?? "Requirement poster"}
        title={`Matching CVs (${total})`}
        description={`${criteria.title} · ${criteria.countryName ?? "No destination country"} · ${trades}`}
        backLink={back}
        actions={[
          ...(criteria.publicUrl ? [{ label: "Public page", href: criteria.publicUrl, icon: <ExternalLink />, variant: "outline" as const, external: true }] : []),
          ...(editHref ? [{ label: "Edit", href: editHref, variant: "outline" as const }] : []),
        ]}
      />
      {!criteria.publicUrl ? (
        <Callout tone="info" title="No public page yet">
          WhatsApp messages will name the requirement and country but carry no link until {criteria.ref.kind === "poster" ? "the poster is published" : "a job for this requirement is published"}.
        </Callout>
      ) : null}
      {result.capped ? (
        <Callout tone="info" title="Showing the best matches only">
          More than {MATCH_LIMIT} CVs or profiles match. The list shows the strongest matches first; narrow the trades to see fewer.
        </Callout>
      ) : null}
      <SectionCard
        title="People to contact"
        description={`${result.cvCount} CV ${result.cvCount === 1 ? "submission" : "submissions"} and ${result.profileCount} candidate ${result.profileCount === 1 ? "profile" : "profiles"}, best match first. CVs marked not suitable are left out.`}
      >
        {total ? (
          <MatchList target={criteria.ref} rows={rows} canContact={canContactMatches(ctx)} canManage={staffCan(ctx, "candidates.manage")} />
        ) : (
          <EmptyState
            variant="plain"
            icon={<Users />}
            title={criteria.trades.length ? "No matching CVs yet" : "Add trades to find matches"}
            description={
              criteria.trades.length
                ? "Nobody who sent a CV or has a profile lists these trades yet. New CVs show up here as they arrive."
                : "Matching uses the trades listed on the requirement. Add at least one trade and come back."
            }
            primaryAction={editHref && !criteria.trades.length ? { label: "Add trades", href: editHref } : undefined}
          />
        )}
      </SectionCard>
    </div>
  );
}
