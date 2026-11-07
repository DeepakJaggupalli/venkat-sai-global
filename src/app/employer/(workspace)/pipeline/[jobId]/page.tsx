import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Users } from "lucide-react";

import { PortalBreadcrumb } from "@/components/layout/portal-breadcrumb";
import { ApplicationDrawer, type DrawerData } from "@/components/employer-talent/application-drawer";
import { isUuid } from "@/components/employer-talent/labels";
import { PipelineBoard, type BoardCard } from "@/components/employer-talent/pipeline-board";
import { timeZoneOptions } from "@/components/employer-talent/time-zones";
import { Callout } from "@/components/shared/callout";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { ActionError } from "@/lib/actions";
import type { SearchParams } from "@/lib/http";
import { orgCan, requireOrgMember } from "@/modules/identity/authz";
import { asEmployer } from "@/modules/recruitment/actors";
import { getApplicationForEmployer, getPipelineBoard } from "@/modules/recruitment/queries";
import type { EmployerApplicationDetail, PipelineBoard as Board } from "@/modules/recruitment/types";

import { accessibleFileSummaries, loadOfferFormOptions, viewerTimeZone } from "../_lib/shared";

export const metadata: Metadata = { title: "Job pipeline" };

function isNotFound(err: unknown): boolean {
  return err instanceof ActionError && (err.code === "not_found" || err.code === "forbidden");
}

export default async function JobPipelinePage({ params, searchParams }: { params: Promise<{ jobId: string }>; searchParams: Promise<SearchParams> }) {
  const ctx = await requireOrgMember("employer", "employer.pipeline.view");
  const [{ jobId }, sp] = await Promise.all([params, searchParams]);
  if (!isUuid(jobId)) notFound();

  let board: Board;
  try {
    board = await getPipelineBoard(asEmployer(ctx), jobId);
  } catch (err) {
    if (isNotFound(err)) notFound();
    throw err;
  }

  const basePath = `/employer/pipeline/${jobId}`;
  const applicationId = typeof sp.application === "string" && isUuid(sp.application) ? sp.application : null;
  let detail: EmployerApplicationDetail | null = null;
  let drawerMissing = false;
  if (applicationId) {
    try {
      detail = await getApplicationForEmployer(ctx, applicationId);
    } catch (err) {
      if (!isNotFound(err)) throw err;
      drawerMissing = true;
    }
    // Links always carry the job, but an application opened under another job is moved to its own board.
    if (detail && detail.job.id !== jobId) redirect(`/employer/pipeline/${detail.job.id}?application=${detail.application.id}`);
  }

  const canManage = orgCan(ctx, "employer.pipeline.manage");
  const timeZone = viewerTimeZone(ctx);
  let drawer: DrawerData | null = null;
  if (detail) {
    const [files, offerOptions] = await Promise.all([accessibleFileSummaries([detail.application.resumeFileId, ...detail.offers.map((o) => o.offerFileId)]), loadOfferFormOptions()]);
    drawer = {
      detail,
      resume: detail.application.resumeFileId ? (files[detail.application.resumeFileId] ?? null) : null,
      offerFiles: files,
      canManage,
      canInterview: orgCan(ctx, "employer.interviews.manage"),
      canOffer: orgCan(ctx, "employer.offers.manage"),
      timeZone,
      timeZones: timeZoneOptions([timeZone]),
      me: { userId: ctx.user.id, name: ctx.user.displayName, email: ctx.user.email ?? null },
      offerOptions,
    };
  }

  const cards: BoardCard[] = board.columns.flatMap((col) =>
    col.cards.map((c) => ({
      id: c.applicationId,
      columnId: col.key,
      code: c.code,
      displayName: c.displayName,
      headline: c.headline ?? c.currentJobTitle,
      city: c.city,
      countryCode: c.countryCode,
      totalExperienceMonths: c.totalExperienceMonths,
      skills: c.skills,
      stageId: c.stage.id,
      stageName: c.stage.name,
      rating: c.rating,
      isShortlisted: c.isShortlisted,
      knockoutFlagCount: c.knockoutFlagCount,
      source: c.source,
      lastStageChangedAt: c.lastStageChangedAt,
    })),
  );
  const truncated = board.columns.filter((c) => c.count > c.cards.length);

  return (
    <div className="space-y-6">
      <PortalBreadcrumb items={[{ label: "Pipeline", href: "/employer/pipeline" }, { label: board.job.title }]} />
      <PageHeader
        title={board.job.title}
        eyebrow={board.job.code}
        description={`${board.total} ${board.total === 1 ? "candidate" : "candidates"} in this pipeline. Drag cards between columns or use each card's “Move to” menu.`}
        backLink={{ href: "/employer/pipeline", label: "All pipelines" }}
        status={<StatusBadge status={board.job.status} domain="job" />}
        actions={[{ label: "Job details", href: `/employer/jobs/${board.job.id}`, variant: "outline" }]}
      />
      {board.requirement ? (
        <p className="text-sm text-muted-foreground">
          Part of workforce requirement {board.requirement.code} · {board.requirement.title}
        </p>
      ) : null}
      {drawerMissing ? (
        <Callout tone="warning" title="That application is not available">
          It may have been withdrawn, or it has not been shared with your organisation yet.
        </Callout>
      ) : null}
      {!canManage ? <Callout tone="info">You can view this pipeline. Moving candidates needs the “Move candidates, give feedback” permission.</Callout> : null}
      {truncated.length ? (
        <p className="text-sm text-muted-foreground">Columns show the most recently moved 100 candidates each ({truncated.map((c) => `${c.label}: ${c.count}`).join(", ")}).</p>
      ) : null}

      {board.total === 0 ? (
        <EmptyState
          icon={<Users aria-hidden />}
          title="No applications yet"
          description="Applications appear here as soon as candidates apply, or when Venkat Sai shares candidates for a managed job."
          primaryAction={orgCan(ctx, "employer.candidates.search") ? { label: "Find candidates", href: "/employer/candidates" } : undefined}
          secondaryAction={{ label: "View job", href: `/employer/jobs/${board.job.id}` }}
        />
      ) : (
        <PipelineBoard columns={board.columns.map((c) => ({ id: c.key, title: c.label }))} cards={cards} stages={board.stages} canManage={canManage} />
      )}

      {drawer ? <ApplicationDrawer key={drawer.detail.application.id} data={drawer} closeHref={basePath} /> : null}
    </div>
  );
}
