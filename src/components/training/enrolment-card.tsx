import { CalendarDays, ChevronRight, MapPin, MonitorSmartphone } from "lucide-react";
import Link from "next/link";

import { DateText } from "@/components/shared/date-text";
import { StatusBadge } from "@/components/shared/status-badge";
import type { CandidateEnrolmentItem } from "@/modules/training/types";

import type { Translate } from "./course-text";
import { attendanceValue, enrolmentTone, isFinalResult, joinPlace, regionName, resultTone } from "./training-rules";

/** One of the learner's enrolments: status, schedule, place, attendance and final result. Server-friendly. */
export function EnrolmentCard({ t, item, locale, fmtLocale }: { t: Translate; item: CandidateEnrolmentItem; locale: string; fmtLocale: string }) {
  const attendance = attendanceValue(item.attendancePercent);
  const place = item.batch.mode === "online" ? null : joinPlace([item.batch.venue, item.batch.city, regionName(item.batch.countryCode, locale)]);
  const href = `/talent/training/enrolments/${item.id}`;
  return (
    <article data-testid="enrolment-card" className="relative flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-xs transition-shadow focus-within:shadow-md hover:shadow-md sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-heading text-base font-semibold text-navy">
            <Link href={href} className="rounded-sm after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:rounded-xl focus-visible:after:ring-3 focus-visible:after:ring-ring/50">
              {item.course.title}
            </Link>
          </h3>
          <p className="text-sm text-muted-foreground">
            {item.providerName === "Venkat Sai" ? t("provider.venkatSai") : item.providerName}
            {item.batch.title ? ` · ${item.batch.title}` : ` · ${item.batch.code}`}
          </p>
        </div>
        <StatusBadge size="sm" tone={enrolmentTone(item.status)}>
          {t(`enrolmentStatus.${item.status}`)}
        </StatusBadge>
      </div>
      <ul className="grid gap-1.5 text-sm text-foreground/80 sm:grid-cols-2">
        <li className="flex items-center gap-2">
          <CalendarDays aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
          {item.batch.startsOn ? (
            <span>
              <DateText value={item.batch.startsOn} dateOnly locale={fmtLocale} />
              {item.batch.endsOn ? (
                <>
                  {" – "}
                  <DateText value={item.batch.endsOn} dateOnly locale={fmtLocale} />
                </>
              ) : null}
            </span>
          ) : (
            t("batch.datesTbc")
          )}
        </li>
        <li className="flex items-center gap-2">
          {item.batch.mode === "online" ? (
            <MonitorSmartphone aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
          ) : (
            <MapPin aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
          )}
          <span className="min-w-0 truncate">{place ?? t(`mode.${item.batch.mode}`)}</span>
        </li>
      </ul>
      {item.batch.schedule ? <p className="text-sm text-muted-foreground">{item.batch.schedule}</p> : null}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-3 text-sm">
        <span>
          <span className="text-muted-foreground">{t("enrolment.attendance")}: </span>
          <span className="font-medium text-navy">{attendance === null ? t("enrolment.noAttendance") : `${attendance}%`}</span>
        </span>
        {isFinalResult(item.resultStatus) ? (
          <span className="flex items-center gap-2">
            <span className="text-muted-foreground">{t("enrolment.result")}:</span>
            <StatusBadge size="sm" tone={resultTone(item.resultStatus)}>
              {t(`resultStatus.${item.resultStatus}`)}
            </StatusBadge>
          </span>
        ) : null}
        <span className="ml-auto flex items-center gap-1 font-medium text-teal-strong" aria-hidden="true">
          {t("enrolment.details")}
          <ChevronRight className="size-4" />
        </span>
      </div>
    </article>
  );
}
