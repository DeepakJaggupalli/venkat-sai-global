import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Users } from "lucide-react";

import { PortalBreadcrumb } from "@/components/layout/portal-breadcrumb";
import { CompareBar, CompareSelectionProvider, CompareToggle } from "@/components/employer-talent/compare-selection";
import { AVAILABILITY_LABELS, formatExperience, isUuid, labelFor, TALENT_LIST_KIND_LABELS } from "@/components/employer-talent/labels";
import { ListItemActions, ListManageButtons } from "@/components/employer-talent/list-actions";
import { ListFormDialog } from "@/components/employer-talent/list-form-dialog";
import { VerificationLevelBadge } from "@/components/employer-talent/verification-level-badge";
import { Callout } from "@/components/shared/callout";
import { DateText } from "@/components/shared/date-text";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { ActionError } from "@/lib/actions";
import { orgCan, requireOrgMember } from "@/modules/identity/authz";
import { asEmployer } from "@/modules/recruitment/actors";
import { getTalentList } from "@/modules/recruitment/queries";
import type { TalentListDetail } from "@/modules/recruitment/types";

import { loadListChoices } from "../../candidates/_lib/lists";
import { orgJobOptions } from "../_lib/queries";

export const metadata: Metadata = { title: "Talent list" };

export default async function TalentListPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireOrgMember("employer", "employer.candidates.lists");
  const { id } = await params;
  if (!isUuid(id)) notFound();
  let list: TalentListDetail;
  try {
    list = await getTalentList(asEmployer(ctx), id);
  } catch (err) {
    if (err instanceof ActionError && (err.code === "not_found" || err.code === "forbidden")) notFound();
    throw err;
  }
  const [jobs, choices] = await Promise.all([orgJobOptions(ctx), loadListChoices(ctx)]);
  const otherLists = choices.lists.filter((l) => l.id !== list.id);
  const canSearch = orgCan(ctx, "employer.candidates.search");
  const linkedJob = list.jobId ? jobs.find((j) => j.value === list.jobId) : undefined;

  return (
    <div className="space-y-6">
      <PortalBreadcrumb items={[{ label: "Talent lists", href: "/employer/lists" }, { label: list.name }]} />
      <PageHeader
        title={list.name}
        description={list.description ?? undefined}
        backLink={{ href: "/employer/lists", label: "All lists" }}
        status={
          <span className="flex flex-wrap gap-1.5">
            <StatusBadge tone="neutral" size="sm">
              {labelFor(TALENT_LIST_KIND_LABELS, list.kind)}
            </StatusBadge>
            <StatusBadge tone={list.isShared ? "info" : "neutral"} size="sm">
              {list.isShared ? "Shared with team" : "Private"}
            </StatusBadge>
            {list.archivedAt ? (
              <StatusBadge tone="warning" size="sm">
                Archived
              </StatusBadge>
            ) : null}
          </span>
        }
        meta={
          <span className="text-sm text-muted-foreground">
            {list.itemCount} {list.itemCount === 1 ? "candidate" : "candidates"}
            {linkedJob ? ` · linked to ${linkedJob.label}` : ""} · updated <DateText value={list.updatedAt} />
          </span>
        }
        actions={[
          <ListFormDialog
            key="edit"
            jobs={jobs}
            list={{ id: list.id, name: list.name, description: list.description, kind: list.kind, jobId: list.jobId, isShared: list.isShared }}
            trigger={
              <Button type="button" variant="outline">
                Edit list
              </Button>
            }
          />,
          <ListManageButtons key="manage" listId={list.id} archived={list.archivedAt !== null} canDelete={list.isOwn} />,
        ]}
      />

      {list.unavailableCount > 0 ? (
        <Callout tone="info" title={`${list.unavailableCount} ${list.unavailableCount === 1 ? "candidate is" : "candidates are"} no longer available`}>
          They hid their profile or stopped sharing it with your organisation, so they are not shown.
        </Callout>
      ) : null}

      {list.items.length === 0 ? (
        <EmptyState
          icon={<Users aria-hidden />}
          title="This list is empty"
          description="Add candidates from search or from a candidate's profile."
          primaryAction={canSearch ? { label: "Find candidates", href: "/employer/candidates" } : undefined}
        />
      ) : (
        <CompareSelectionProvider>
          <ul className="grid gap-4 lg:grid-cols-2" aria-label="Candidates on this list">
            {list.items.map((item) => {
              const c = item.candidate;
              return (
                <li key={c.candidateId} className="relative flex flex-col gap-3 rounded-xl border bg-card p-4 focus-within:ring-2 focus-within:ring-ring">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h2 className="font-heading text-base font-semibold">
                        <Link href={`/employer/candidates/${c.candidateId}`} className="after:absolute after:inset-0 focus-visible:outline-none">
                          {c.displayName}
                        </Link>
                      </h2>
                      <p className="text-sm text-foreground/90">{c.headline ?? c.currentJobTitle ?? "Candidate"}</p>
                      <p className="text-sm text-muted-foreground">
                        {[c.city, c.countryCode].filter(Boolean).join(", ") || "Location not shared"} · {formatExperience(c.totalExperienceMonths)} ·{" "}
                        {labelFor(AVAILABILITY_LABELS, c.availability, "Availability not shared")}
                      </p>
                    </div>
                    <VerificationLevelBadge level={c.verificationLevel} />
                  </div>
                  {c.skills.length ? <p className="line-clamp-2 text-sm text-muted-foreground">Skills: {c.skills.slice(0, 8).join(", ")}</p> : null}
                  {item.stage || item.note ? (
                    <div className="rounded-lg bg-surface-subtle p-3 text-sm">
                      {item.stage ? <p className="font-medium">Status: {item.stage}</p> : null}
                      {item.note ? <p className="whitespace-pre-line text-muted-foreground">{item.note}</p> : null}
                    </div>
                  ) : null}
                  <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t pt-3">
                    <p className="text-xs text-muted-foreground">
                      Added <DateText value={item.addedAt} />
                      {item.addedByName ? ` by ${item.addedByName}` : ""}
                    </p>
                    <div className="relative z-10 flex flex-wrap items-center gap-2">
                      <CompareToggle candidateId={c.candidateId} name={c.displayName} />
                      <ListItemActions listId={list.id} candidateId={c.candidateId} name={c.displayName} note={item.note} stage={item.stage} />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          <CompareBar lists={otherLists} canUseLists />
        </CompareSelectionProvider>
      )}
    </div>
  );
}
