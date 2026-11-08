import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { JsonLd } from "@/components/public/json-ld";
import { Breadcrumbs } from "@/components/public/page-hero";
import { TrackEvent } from "@/components/public/track-event";
import { CourseDetail } from "@/components/training/course-detail";
import { TrainingI18n } from "@/components/training/training-i18n";
import { courseApplyPath, OPEN_ENROLMENT_STATUSES } from "@/components/training/training-rules";
import { BRAND } from "@/config/site";
import { getT } from "@/i18n/server";
import { absoluteUrl } from "@/lib/env";
import { getCandidateByUserId } from "@/modules/candidates/guard";
import { getCurrentUser } from "@/modules/identity/session";
import { getPublicCourse, listCandidateEnrolments } from "@/modules/training/queries";
import { toIsoDate } from "@/modules/training/rules";

type PageProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const [t, course] = await Promise.all([getT("talent-training"), getPublicCourse(slug)]);
  if (!course) return { title: t("detail.notFound"), robots: { index: false } };
  return { title: course.title, description: course.summary ?? undefined, alternates: { canonical: `/training/${course.slug}` } };
}

/** Public course page: everything needed to decide, with batch calls to action that lead to sign-in and enrolment. */
export default async function PublicCoursePage({ params }: PageProps) {
  const { slug } = await params;
  const [t, course, user] = await Promise.all([getT("talent-training"), getPublicCourse(slug), getCurrentUser()]);
  if (!course) notFound();

  const candidate = user ? await getCandidateByUserId(user.id) : null;
  const enrolments = user && candidate ? await listCandidateEnrolments({ userId: user.id, candidateId: candidate.id, displayName: user.displayName }) : [];
  const enrolledBatchIds = enrolments.filter((e) => OPEN_ENROLMENT_STATUSES.includes(e.status)).map((e) => e.batchId);
  const providerName = course.provider.kind === "institution" ? course.provider.name : t("provider.venkatSai");
  // schema.org Course: only facts the page itself shows (no ratings, prices or accreditation claims).
  const courseJsonLd = {
    "@context": "https://schema.org",
    "@type": "Course",
    name: course.title,
    description: course.summary ?? course.title,
    url: absoluteUrl(`/training/${course.slug}`),
    provider: { "@type": "Organization", name: course.provider.kind === "institution" ? course.provider.name : BRAND.name },
  };

  return (
    <TrainingI18n className="bg-surface-subtle">
      <JsonLd data={courseJsonLd} />
      <TrackEvent name="course_viewed" props={{ courseId: course.id, category: course.category, surface: "public" }} />
      <section className="border-b border-border bg-white">
        <div className="container-page pt-10 pb-10 sm:pt-12 sm:pb-12">
          <Breadcrumbs items={[{ label: t("public.breadcrumbHome"), href: "/" }, { label: t("public.title"), href: "/training" }, { label: course.title }]} className="mb-8" />
          <p className="label-dot">{t(`category.${course.category}`)}</p>
          <h1 className="mt-4 font-display text-[2.25rem] text-balance text-foreground sm:text-5xl">{course.title}</h1>
          <p className="mt-3 text-sm text-muted-foreground">{t("detail.byProvider", { provider: providerName })}</p>
          {course.summary ? <p className="mt-4 max-w-3xl text-base text-muted-foreground sm:text-lg">{course.summary}</p> : null}
          {course.batches.length ? (
            <a href="#batches" className="mt-7 inline-flex min-h-11 items-center rounded-full bg-foreground px-5 text-sm font-semibold text-white transition-colors hover:bg-[#26262b] focus-visible:outline-2 focus-visible:outline-offset-2">
              {t("detail.seeBatches")}
            </a>
          ) : null}
        </div>
      </section>
      <div className="container-page py-8 sm:py-10">
        <CourseDetail
          course={course}
          today={toIsoDate(new Date())}
          ctaMode={user ? "apply" : "signIn"}
          batchHref={(batchId) => {
            const apply = courseApplyPath(course.slug, batchId);
            return user ? apply : `/sign-in?returnTo=${encodeURIComponent(apply)}`;
          }}
          enrolledBatchIds={enrolledBatchIds}
        />
      </div>
    </TrainingI18n>
  );
}
