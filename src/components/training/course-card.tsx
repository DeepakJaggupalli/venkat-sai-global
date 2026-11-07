import { Award, CalendarDays, Clock, GraduationCap, MapPin, MonitorSmartphone } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { OrgAvatar } from "@/components/shared/avatars";
import { DateText } from "@/components/shared/date-text";
import { StatusBadge } from "@/components/shared/status-badge";
import { getLocale, getT } from "@/i18n/server";
import type { CatalogueCourse } from "@/modules/training/types";

import { certificationLabel, durationText, FeeText } from "./course-text";
import { intlLocale, joinPlace, regionName } from "./training-rules";

/**
 * Catalogue card: cover, category, title, provider, summary and the facts people compare first
 * (mode, duration, certificate, fee, next batch). Server component.
 */
export async function CourseCard({ course, href, headingLevel = "h3" }: { course: CatalogueCourse; href: string; headingLevel?: "h2" | "h3" }) {
  const [t, locale] = await Promise.all([getT("talent-training"), getLocale()]);
  const fmt = intlLocale(locale);
  const Heading = headingLevel;
  const duration = durationText(t, course);
  const next = course.nextBatch;
  const nextPlace = next ? joinPlace([next.city, regionName(next.countryCode, locale)]) : null;

  return (
    <article data-testid="course-card" className="group relative flex min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-xs transition-shadow focus-within:shadow-md hover:shadow-md">
      <div className="relative aspect-[16/7] w-full overflow-hidden bg-teal-soft">
        {course.cover ? (
          <Image src={course.cover.url} alt="" fill unoptimized sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw" className="object-cover" />
        ) : (
          <div aria-hidden="true" className="flex h-full items-center justify-center bg-[linear-gradient(135deg,var(--color-teal-soft),var(--color-surface-subtle))]">
            <GraduationCap className="size-10 text-teal-strong/70" />
          </div>
        )}
        {course.isFeatured ? (
          <span className="absolute top-3 left-3">
            <StatusBadge tone="gold" size="sm">
              {t("card.featured")}
            </StatusBadge>
          </span>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4 sm:p-5">
        <p className="text-xs font-medium text-muted-foreground">{t(`category.${course.category}`)}</p>
        <Heading className="font-heading text-lg leading-snug font-semibold text-navy">
          {/* The whole card is clickable through this link's ::after overlay; inner content stays readable. */}
          <Link href={href} className="rounded-sm after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:rounded-xl focus-visible:after:ring-3 focus-visible:after:ring-ring/50">
            {course.title}
          </Link>
        </Heading>

        <div className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
          {course.provider.kind === "institution" ? (
            <>
              <OrgAvatar name={course.provider.name} src={course.provider.logo?.thumbnailUrl ?? course.provider.logo?.url ?? undefined} size="xs" verified />
              <span className="truncate">{course.provider.name}</span>
              <span className="sr-only">{t("provider.verifiedInstitution")}</span>
            </>
          ) : (
            <span className="truncate">{t("provider.venkatSai")}</span>
          )}
        </div>

        {course.summary ? <p className="line-clamp-3 text-sm text-pretty text-foreground/80">{course.summary}</p> : null}

        <ul className="mt-auto grid gap-1.5 pt-1 text-sm text-foreground/80">
          <li className="flex items-center gap-2">
            <MonitorSmartphone aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
            <span className="sr-only">{t("facts.mode")}: </span>
            {t(`mode.${course.mode}`)}
            {duration ? (
              <>
                <span aria-hidden="true" className="text-muted-foreground">
                  ·
                </span>
                <Clock aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                <span className="sr-only">{t("facts.duration")}: </span>
                {duration}
              </>
            ) : null}
          </li>
          <li className="flex items-center gap-2">
            <Award aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
            <span className="sr-only">{t("facts.certificate")}: </span>
            {certificationLabel(t, course.certificationType)}
          </li>
          <li className="flex flex-wrap items-center gap-x-2">
            <span className="text-muted-foreground">{t("facts.fee")}:</span>
            <FeeText t={t} feeType={course.feeType} feeMinor={course.feeMinor} feeCurrency={course.feeCurrency} locale={fmt} className="font-semibold text-navy" />
          </li>
        </ul>

        <div className="border-t border-border pt-3 text-sm">
          {next ? (
            <div className="space-y-1">
              <p className="flex items-center gap-2 text-foreground">
                <CalendarDays aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                {next.startsOn ? (
                  <span>
                    {t("card.nextBatch")} <DateText value={next.startsOn} dateOnly locale={fmt} className="font-medium" />
                  </span>
                ) : (
                  <span>{t("card.openBatch")}</span>
                )}
              </p>
              {nextPlace || next.mode !== "in_person" ? (
                <p className="flex items-center gap-2 text-muted-foreground">
                  <MapPin aria-hidden="true" className="size-4 shrink-0" />
                  {next.mode === "online" ? t("mode.online") : (nextPlace ?? t(`mode.${next.mode}`))}
                </p>
              ) : null}
              {course.openBatchCount > 1 ? <p className="text-muted-foreground">{t("card.moreBatches", { count: course.openBatchCount - 1 })}</p> : null}
            </div>
          ) : (
            <p className="text-muted-foreground">{t("card.noOpenBatch")}</p>
          )}
        </div>
      </div>
    </article>
  );
}
