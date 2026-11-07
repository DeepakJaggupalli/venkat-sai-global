import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { JobDetailView } from "@/components/jobs/job-detail";
import { applyCtaFor, loadJobDetail, viewerTimeZone } from "@/components/jobs/job-detail-data";
import { TrackEvent } from "@/components/jobs/track-event";
import { PortalBreadcrumb } from "@/components/layout/portal-breadcrumb";
import { getLocale, getT } from "@/i18n/server";
import { absoluteUrl } from "@/lib/env";
import { requireCandidate } from "@/modules/candidates/guard";
import { getPublicJobBySlug } from "@/modules/jobs/queries";

import { findOwnApplicationForJob } from "../../applications/_lib/queries";

type PageProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const t = await getT("talent-jobs");
  const job = await getPublicJobBySlug(decodeURIComponent(slug));
  return { title: job?.title ?? t("detail.notFoundTitle") };
}

/** A job inside the People Portal: the same page as the public board, with the candidate's own state. */
export default async function TalentJobPage({ params }: PageProps) {
  const { user, candidate } = await requireCandidate();
  const { slug } = await params;
  const [t, locale] = await Promise.all([getT("talent-jobs"), getLocale()]);
  const job = await loadJobDetail(slug, { userId: user.id, candidateId: candidate.id });
  if (!job) notFound();
  const application = job.hasApplied ? await findOwnApplicationForJob(candidate.id, job.id) : null;
  let apply = applyCtaFor(job, true);
  if (application && application.status !== "withdrawn") apply = { kind: "applied", href: `/talent/applications/${application.id}` };
  else if (application && job.applyMode === "platform" && job.displayStatus === "published") apply = { kind: "platform", href: `/talent/apply/${job.id}`, signedIn: true };

  return (
    <div className="space-y-4">
      <PortalBreadcrumb items={[{ label: t("discover.title"), href: "/talent/jobs" }, { label: job.title }]} />
      <TrackEvent name="job_view" props={{ jobId: job.id, overseas: job.isOverseas, surface: "talent" }} dedupeKey={job.id} />
      <JobDetailView
        job={job}
        t={t}
        locale={locale}
        apply={apply}
        shareUrl={absoluteUrl(`/jobs/${job.slug}`)}
        viewer={{ signedIn: true, returnTo: `/talent/jobs/${job.slug}` }}
        timeZone={viewerTimeZone(user)}
      />
    </div>
  );
}
