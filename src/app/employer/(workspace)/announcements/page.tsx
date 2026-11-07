import type { Metadata } from "next";
import { Megaphone } from "lucide-react";

import { Callout } from "@/components/shared/callout";
import { DateText } from "@/components/shared/date-text";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { env } from "@/lib/env";
import { getLatestApprovalForEntity } from "@/modules/approvals/service";
import { ANNOUNCEMENT_AUDIENCE_LABELS, ANNOUNCEMENT_PLACEMENT_LABELS } from "@/modules/content/constants";
import { listPartnerAnnouncements } from "@/modules/content/queries";
import { requireOrgMember } from "@/modules/identity/authz";

import { AnnouncementForm } from "./_components/announcement-form";
import { AnnouncementRowActions } from "./_components/announcement-row-actions";

export const metadata: Metadata = { title: "Announcements" };

const STATUS: Record<string, { label: string; tone: "neutral" | "info" | "success" | "warning" }> = {
  scheduled: { label: "Approved, scheduled", tone: "info" },
  published: { label: "Live", tone: "success" },
  expired: { label: "Ended", tone: "neutral" },
  archived: { label: "Withdrawn or not approved", tone: "neutral" },
};

export default async function EmployerAnnouncementsPage() {
  const ctx = await requireOrgMember("employer", "employer.company.manage");
  const timeZone = ctx.user.timezone ?? env().DEFAULT_TIMEZONE;
  const verified = ctx.organization.status === "verified";
  const rows = await listPartnerAnnouncements(ctx);
  // Review state for drafts: in review vs changes requested (reason shown to the organisation).
  const reviews = new Map(
    await Promise.all(
      rows
        .filter((r) => r.status === "draft" || r.status === "archived")
        .map(async (r) => {
          const latest = await getLatestApprovalForEntity("partner_announcement", r.id).catch(() => null);
          return [r.id, latest ? { status: latest.status as string, reason: latest.decisionReason } : null] as const;
        }),
    ),
  );

  return (
    <div className="space-y-8">
      <PageHeader
        title="Announcements"
        description="Ask Venkat Sai to share news with candidates: walk-in interviews, hiring drives or new projects. Every announcement is reviewed before it appears."
      />

      {!verified ? (
        <Callout tone="info" title="Available to verified companies" action={{ label: "Go to verification", href: "/employer/company/verification" }}>
          Announcements can be requested once Venkat Sai has verified your company.
        </Callout>
      ) : (
        <SectionCard title="Request an announcement" description="Keep it factual. Never ask candidates to pay a fee.">
          <AnnouncementForm />
        </SectionCard>
      )}

      <SectionCard title="Your announcements" flush>
        {rows.length ? (
          <ul className="divide-y divide-border">
            {rows.map((r) => {
              const review = reviews.get(r.id) ?? null;
              const inReview = r.status === "draft" && review && ["pending", "in_review", "escalated"].includes(review.status);
              const changes = r.status === "draft" && review?.status === "changes_requested";
              const badge =
                r.status === "draft"
                  ? changes
                    ? { label: "Changes requested", tone: "warning" as const }
                    : inReview
                      ? { label: "In review", tone: "info" as const }
                      : { label: "Draft", tone: "neutral" as const }
                  : (STATUS[r.status] ?? { label: r.status, tone: "neutral" as const });
              return (
                <li key={r.id} className="space-y-2 px-5 py-4" data-testid="announcement">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="font-medium text-foreground">{r.title}</p>
                      {r.body ? <p className="text-sm text-muted-foreground">{r.body}</p> : null}
                      <p className="mt-1 text-xs text-muted-foreground">
                        {r.audience.map((a) => ANNOUNCEMENT_AUDIENCE_LABELS[a]).join(", ")} · {r.placements.map((p) => ANNOUNCEMENT_PLACEMENT_LABELS[p]).join(", ")}
                        {r.startsAt ? (
                          <>
                            {" "}
                            · from <DateText value={r.startsAt} mode="datetime" timeZone={timeZone} />
                          </>
                        ) : null}
                        {r.endsAt ? (
                          <>
                            {" "}
                            · until <DateText value={r.endsAt} mode="datetime" timeZone={timeZone} />
                          </>
                        ) : null}
                      </p>
                    </div>
                    <StatusBadge tone={badge.tone} size="sm">
                      {badge.label}
                    </StatusBadge>
                  </div>
                  {review?.reason && (changes || review.status === "rejected") ? (
                    <Callout tone="warning" title="Reviewer feedback">
                      {review.reason}
                    </Callout>
                  ) : null}
                  {verified ? (
                    <AnnouncementRowActions
                      editable={r.status === "draft"}
                      withdrawable={r.status !== "archived" && r.status !== "expired"}
                      announcement={{
                        id: r.id,
                        title: r.title,
                        body: r.body,
                        linkUrl: r.linkUrl,
                        linkLabel: r.linkLabel,
                        startsAt: r.startsAt?.toISOString() ?? null,
                        endsAt: r.endsAt?.toISOString() ?? null,
                        audience: r.audience,
                        placements: r.placements,
                        priority: r.priority,
                      }}
                    />
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="p-5">
            <EmptyState size="sm" variant="plain" icon={<Megaphone aria-hidden="true" />} title="No announcements yet" description="Requests you send appear here with their review status." />
          </div>
        )}
      </SectionCard>
    </div>
  );
}
