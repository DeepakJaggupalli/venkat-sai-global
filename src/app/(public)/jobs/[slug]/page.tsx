import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { JobDetailView } from "@/components/jobs/job-detail";
import { applyCtaFor, jobPostingScript, loadJobDetail, viewerTimeZone } from "@/components/jobs/job-detail-data";
import { TrackEvent } from "@/components/jobs/track-event";
import { getLocale, getT } from "@/i18n/server";
import { absoluteUrl } from "@/lib/env";
import { getCandidateByUserId } from "@/modules/candidates/guard";
import { getCurrentUser } from "@/modules/identity/session";
import { getPublicJobBySlug } from "@/modules/jobs/queries";

type PageProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const t = await getT("talent-jobs");
  const job = await getPublicJobBySlug(decodeURIComponent(slug));
  if (!job) return { title: t("detail.notFoundTitle"), robots: { index: false } };
  const where = [job.location.city, job.location.countryName].filter(Boolean).join(", ");
  const title = where ? t("detail.metaTitleWhere", { title: job.title, where }) : job.title;
  const description = job.summary ?? t("detail.metaDescription", { title: job.title, employer: job.employer.name });
  return {
    title,
    description,
    alternates: { canonical: `/jobs/${job.slug}` },
    openGraph: { title, description, url: absoluteUrl(`/jobs/${job.slug}`), type: "website" },
  };
}

/** Public job page: full details, JobPosting JSON-LD, save / share, and Apply → People Portal (sign-in first). */
export default async function PublicJobPage({ params }: PageProps) {
  const { slug } = await params;
  const [t, locale, user] = await Promise.all([getT("talent-jobs"), getLocale(), getCurrentUser()]);
  const candidate = user ? await getCandidateByUserId(user.id) : null;
  const job = await loadJobDetail(slug, { userId: user?.id ?? null, candidateId: candidate?.id ?? null });
  if (!job) notFound();
  const ld = await jobPostingScript(job);
  const path = `/jobs/${job.slug}`;

  return (
    <div className="bg-surface-subtle">
      <script type="application/ld+json" nonce={ld.nonce} dangerouslySetInnerHTML={{ __html: ld.json }} />
      <TrackEvent name="job_view" props={{ jobId: job.id, overseas: job.isOverseas, surface: "public" }} dedupeKey={job.id} />
      <div className="container-page space-y-4 py-6 sm:py-8">
        <nav aria-label={t("detail.breadcrumb")}>
          <Link href="/jobs" className="inline-flex items-center gap-1 text-sm font-medium text-teal-strong underline-offset-2 hover:underline">
            <ChevronLeft aria-hidden="true" className="size-4" />
            {t("detail.backToJobs")}
          </Link>
        </nav>
        <JobDetailView
          job={job}
          t={t}
          locale={locale}
          apply={applyCtaFor(job, !!user)}
          shareUrl={absoluteUrl(path)}
          viewer={{ signedIn: !!user, returnTo: path }}
          timeZone={viewerTimeZone(user)}
        />
      </div>
    </div>
  );
}
