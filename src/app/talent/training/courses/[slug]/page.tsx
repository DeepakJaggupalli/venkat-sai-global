import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { TrackEvent } from "@/components/public/track-event";
import { PageHeader } from "@/components/shared/page-header";
import { CourseDetail } from "@/components/training/course-detail";
import { courseApplyPath, OPEN_ENROLMENT_STATUSES } from "@/components/training/training-rules";
import { getT } from "@/i18n/server";
import { requireCandidate } from "@/modules/candidates/guard";
import { getPublicCourse, listCandidateEnrolments } from "@/modules/training/queries";
import { toIsoDate } from "@/modules/training/rules";

type PageProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const [t, course] = await Promise.all([getT("talent-training"), getPublicCourse(slug)]);
  return { title: course?.title ?? t("detail.notFound") };
}

/** Course page inside the People Portal; batch buttons open the enrolment flow. */
export default async function TalentCoursePage({ params }: PageProps) {
  const { user, candidate } = await requireCandidate();
  const { slug } = await params;
  const [t, course, enrolments] = await Promise.all([
    getT("talent-training"),
    getPublicCourse(slug),
    listCandidateEnrolments({ userId: user.id, candidateId: candidate.id, displayName: user.displayName }),
  ]);
  if (!course) notFound();
  const providerName = course.provider.kind === "institution" ? course.provider.name : t("provider.venkatSai");

  return (
    <div className="space-y-6">
      <TrackEvent name="course_viewed" props={{ courseId: course.id, category: course.category, surface: "talent" }} />
      <PageHeader
        eyebrow={t(`category.${course.category}`)}
        title={course.title}
        description={course.summary ?? t("detail.byProvider", { provider: providerName })}
        breadcrumbs={[
          { label: t("talent.title"), href: "/talent/training" },
          { label: t("talent.discoverTitle"), href: "/talent/training/courses" },
          { label: course.title },
        ]}
        actions={course.batches.length ? [{ label: t("detail.seeBatches"), href: "#batches" }] : undefined}
      />
      <CourseDetail
        course={course}
        today={toIsoDate(new Date())}
        ctaMode="apply"
        batchHref={(batchId) => courseApplyPath(course.slug, batchId)}
        enrolledBatchIds={enrolments.filter((e) => OPEN_ENROLMENT_STATUSES.includes(e.status)).map((e) => e.batchId)}
      />
    </div>
  );
}
