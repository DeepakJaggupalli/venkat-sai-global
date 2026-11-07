import { CalendarDays, Clock, MapPin, MonitorSmartphone, Users } from "lucide-react";

import { ActionLink } from "@/components/shared/action-link";
import { DateText } from "@/components/shared/date-text";
import { StatusBadge } from "@/components/shared/status-badge";
import type { CatalogueBatch } from "@/modules/training/types";

import type { Translate } from "./course-text";
import { batchCta, joinPlace, regionName } from "./training-rules";

export type BatchCtaMode = "apply" | "signIn";

/**
 * One batch: dates, schedule, place, seats, registration deadline and the call to action for today.
 * Server-friendly; `ctaHref` is null when the batch cannot be applied to.
 */
export function BatchCard({
  t,
  batch,
  today,
  locale,
  fmtLocale,
  ctaHref,
  ctaMode,
  enrolled = false,
}: {
  t: Translate;
  batch: CatalogueBatch;
  today: string;
  locale: string;
  fmtLocale: string;
  ctaHref: string;
  ctaMode: BatchCtaMode;
  /** The signed-in candidate already holds (or waits for) a place in this batch. */
  enrolled?: boolean;
}) {
  const cta = batchCta(batch, today);
  const place = batch.mode === "online" ? null : joinPlace([batch.venue, batch.city, regionName(batch.countryCode, locale)]);
  const name = batch.title ?? batch.code;
  const ctaLabel =
    ctaMode === "signIn" ? t("batch.signInToApply") : cta === "waitlist" ? t("batch.joinWaitlist") : t("batch.apply");

  return (
    <article data-testid="batch-card" aria-labelledby={`batch-${batch.id}`} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 id={`batch-${batch.id}`} className="font-heading text-base font-semibold text-navy">
            {name}
          </h3>
          <StatusBadge size="sm" tone={cta === "apply" ? "success" : cta === "waitlist" ? "warning" : "neutral"}>
            {t(`batchStatus.${batch.status}`)}
          </StatusBadge>
        </div>
        <ul className="grid gap-1.5 text-sm text-foreground/80">
          <li className="flex flex-wrap items-center gap-2">
            <CalendarDays aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
            {batch.startsOn ? (
              <span>
                <span className="sr-only">{t("batch.dates")}: </span>
                <DateText value={batch.startsOn} dateOnly locale={fmtLocale} />
                {batch.endsOn ? (
                  <>
                    {" – "}
                    <DateText value={batch.endsOn} dateOnly locale={fmtLocale} />
                  </>
                ) : null}
              </span>
            ) : (
              <span>{t("batch.datesTbc")}</span>
            )}
          </li>
          {batch.schedule ? (
            <li className="flex items-center gap-2">
              <Clock aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
              <span className="sr-only">{t("batch.schedule")}: </span>
              {batch.schedule}
            </li>
          ) : null}
          <li className="flex items-start gap-2">
            {batch.mode === "online" ? (
              <MonitorSmartphone aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            ) : (
              <MapPin aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            )}
            <span>
              <span className="sr-only">{t("batch.venue")}: </span>
              {t(`mode.${batch.mode}`)}
              {place ? ` · ${place}` : ""}
            </span>
          </li>
          <li className="flex items-center gap-2">
            <Users aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
            {batch.seatsLeft === null ? t("batch.seatsOpen") : batch.seatsLeft === 0 ? t("batch.noSeats") : t("batch.seatsLeft", { count: batch.seatsLeft })}
          </li>
        </ul>
        {batch.registrationDeadline ? (
          <p className="text-xs text-muted-foreground">
            {t("batch.deadline")} <DateText value={batch.registrationDeadline} dateOnly locale={fmtLocale} />
          </p>
        ) : null}
      </div>
      <div className="shrink-0">
        {enrolled ? (
          <ActionLink label={t("batch.viewEnrolment")} href="/talent/training" variant="outline" />
        ) : cta === "apply" || cta === "waitlist" ? (
          <ActionLink label={ctaLabel} href={ctaHref} variant={cta === "apply" ? "default" : "outline"} />
        ) : (
          <p className="text-sm text-muted-foreground">{cta === "not_open" ? t("batch.notOpenYet") : t("batch.closed")}</p>
        )}
      </div>
    </article>
  );
}
