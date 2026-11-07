import { BellRing, Plus } from "lucide-react";
import type { Metadata } from "next";

import { isFlagOn, readMulti, recordReader } from "@/components/jobs/filter-params";
import { enumLabel, type Translate } from "@/components/jobs/labels";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { getLocale, getT } from "@/i18n/server";
import { formatDate, formatMoney, fromMinorUnits } from "@/lib/format";
import { sp as firstParam, type SearchParams } from "@/lib/http";
import { cn } from "@/lib/utils";
import { requireCandidate } from "@/modules/candidates/guard";
import { isMinor } from "@/modules/candidates/profile-rules";
import { JOB_LIMITS } from "@/modules/jobs/constants";
import { getJobAlert, listJobAlerts } from "@/modules/jobs/saved-alerts-service";
import type { JobAlertView } from "@/modules/jobs/types";
import { countryOptions, currencyOptions, jobCategoryOptions } from "@/modules/taxonomy/queries";

import { intlLocale } from "@/components/jobs/labels";
import { AlertControls } from "./alert-controls";
import { AlertForm, type AlertDraft } from "./alert-form";

type PageProps = { searchParams: Promise<SearchParams> };

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("talent-jobs");
  return { title: t("alerts.title") };
}

const ALLOWED_TYPES = new Set(["full_time", "part_time", "contract", "temporary", "internship", "apprenticeship", "freelance", "gig", "project_based"]);
const ALLOWED_MODES = new Set(["on_site", "remote", "hybrid"]);

/** A new alert pre-filled from a job search (the "Create an alert for this search" links). */
function draftFromSearch(params: SearchParams, t: Translate): AlertDraft {
  const reader = recordReader(params);
  const keywords = (firstParam(params, "q") ?? "").slice(0, 200);
  return {
    name: keywords ? t("alerts.defaultNameFor", { keywords: keywords.slice(0, 60) }) : t("alerts.defaultName"),
    keywords,
    categoryIds: readMulti(reader, "category").slice(0, 10),
    countries: readMulti(reader, "country").map((c) => c.toUpperCase()).slice(0, 20),
    employmentTypes: readMulti(reader, "type").filter((v) => ALLOWED_TYPES.has(v)),
    workModes: readMulti(reader, "mode").filter((v) => ALLOWED_MODES.has(v)),
    overseasOnly: isFlagOn(firstParam(params, "overseas")),
    salaryMin: firstParam(params, "salaryMin") ?? "",
    salaryCurrency: firstParam(params, "salaryCurrency") ?? "",
    salaryPeriod: firstParam(params, "salaryPeriod") ?? "",
    frequency: "weekly",
    channels: ["email", "in_app"],
    isActive: true,
  };
}

function draftFromAlert(alert: JobAlertView): AlertDraft {
  const c = alert.criteria;
  return {
    id: alert.id,
    name: alert.name,
    keywords: c.keywords ?? "",
    categoryIds: c.categoryIds ?? [],
    countries: c.countries ?? [],
    employmentTypes: c.employmentTypes ?? [],
    workModes: c.workModes ?? [],
    overseasOnly: !!c.overseasOnly,
    salaryMin: c.salaryMin ? String(fromMinorUnits(c.salaryMin.amountMinor, c.salaryMin.currency)) : "",
    salaryCurrency: c.salaryMin?.currency ?? "",
    salaryPeriod: c.salaryMin?.period ?? "",
    frequency: alert.frequency,
    channels: alert.channels,
    isActive: alert.isActive,
  };
}

/** Plain-language summary of what an alert matches. */
function criteriaSummary(alert: JobAlertView, t: Translate, labels: { categories: Map<string, string>; countries: Map<string, string> }, locale: string): string[] {
  const c = alert.criteria;
  const parts: string[] = [];
  if (c.keywords) parts.push(t("alerts.summaryKeywords", { keywords: c.keywords }));
  if (c.categoryIds?.length) parts.push(c.categoryIds.map((id) => labels.categories.get(id) ?? t("alerts.unknownCategory")).join(", "));
  if (c.countries?.length) parts.push(c.countries.map((code) => labels.countries.get(code) ?? code).join(", "));
  if (c.employmentTypes?.length) parts.push(c.employmentTypes.map((v) => enumLabel(t, "employmentType", v)).join(", "));
  if (c.workModes?.length) parts.push(c.workModes.map((v) => enumLabel(t, "workMode", v)).join(", "));
  if (c.overseasOnly) parts.push(t("alerts.summaryOverseas"));
  if (c.salaryMin)
    parts.push(
      t("alerts.summarySalary", {
        amount: formatMoney(c.salaryMin.amountMinor, c.salaryMin.currency, intlLocale(locale)),
        period: enumLabel(t, "salaryPeriod", c.salaryMin.period).toLowerCase(),
      }),
    );
  return parts.length ? parts : [t("alerts.summaryAll")];
}

/**
 * Job alerts (spec 8.6): up to 10 saved searches, each daily or weekly, by email, in-app, WhatsApp or SMS.
 * `?new=1` (+ search params) opens a pre-filled form; `?edit=<id>` or `?alert=<id>` (digest emails) opens one alert.
 */
export default async function JobAlertsPage({ searchParams }: PageProps) {
  const { user, candidate } = await requireCandidate();
  const params = await searchParams;
  const [t, locale, alerts, categories, countries, currencies] = await Promise.all([
    getT("talent-jobs"),
    getLocale(),
    listJobAlerts(user),
    jobCategoryOptions(),
    countryOptions(),
    currencyOptions(),
  ]);
  const editId = firstParam(params, "edit") ?? firstParam(params, "alert");
  const editing = editId ? await getJobAlert(user, editId).catch(() => null) : null;
  const atLimit = alerts.length >= JOB_LIMITS.alertsPerUser;
  const creating = !editing && firstParam(params, "new") === "1" && !atLimit;
  const minor = isMinor(candidate.dateOfBirth, false);
  const draft = editing ? draftFromAlert(editing) : creating ? draftFromSearch(params, t) : null;
  if (draft && minor) draft.overseasOnly = false;
  const labels = { categories: new Map(categories.map((o) => [o.value, o.label])), countries: new Map(countries.map((o) => [o.value, o.label])) };
  const timeZone = user.timezone ?? undefined;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("alerts.title")}
        description={t("alerts.description")}
        actions={!draft && !atLimit ? [{ label: t("alerts.create"), href: "/talent/alerts?new=1", icon: <Plus aria-hidden="true" /> }] : undefined}
        meta={<span className="text-sm text-muted-foreground">{t("alerts.usage", { count: alerts.length, max: JOB_LIMITS.alertsPerUser })}</span>}
      />

      {draft ? (
        <SectionCard title={draft.id ? t("alerts.editTitle") : t("alerts.newTitle")} description={t("alerts.formDescription")} id="alert-form">
          <AlertForm draft={draft} categories={categories} countries={countries} currencies={currencies} allowOverseas={!minor} hasPhone={!!user.phoneVerifiedAt} />
        </SectionCard>
      ) : null}
      {atLimit && firstParam(params, "new") === "1" ? <p className="rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning-strong">{t("alerts.limitReached", { max: JOB_LIMITS.alertsPerUser })}</p> : null}

      {alerts.length ? (
        <ul className="space-y-3" aria-label={t("alerts.listLabel")}>
          {alerts.map((alert) => (
            <li
              key={alert.id}
              id={`alert-${alert.id}`}
              className={cn("rounded-xl border bg-card p-4 shadow-xs sm:p-5", editing?.id === alert.id && "border-teal ring-2 ring-teal/30")}
              data-testid="alert-item"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <h2 className="font-heading text-base font-semibold text-navy">{alert.name}</h2>
                  <p className="text-sm text-muted-foreground">{criteriaSummary(alert, t, labels, locale).join(" · ")}</p>
                </div>
                <StatusBadge tone={alert.isActive ? "success" : "neutral"} size="sm">
                  {alert.isActive ? t("alerts.stateOn") : t("alerts.statePaused")}
                </StatusBadge>
              </div>
              <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
                <div className="flex gap-1">
                  <dt className="text-muted-foreground">{t("alerts.frequency")}:</dt>
                  <dd>{enumLabel(t, "alertFrequency", alert.frequency)}</dd>
                </div>
                <div className="flex gap-1">
                  <dt className="text-muted-foreground">{t("alerts.channels")}:</dt>
                  <dd>{alert.channels.map((c) => enumLabel(t, "alertChannel", c)).join(", ")}</dd>
                </div>
                <div className="flex gap-1">
                  <dt className="text-muted-foreground">{t("alerts.lastSent")}:</dt>
                  <dd>{alert.lastSentAt ? formatDate(alert.lastSentAt, { timeZone, locale: intlLocale(locale) }) : t("alerts.notSentYet")}</dd>
                </div>
              </dl>
              <div className="mt-3 border-t pt-3">
                <AlertControls id={alert.id} name={alert.name} isActive={alert.isActive} />
              </div>
            </li>
          ))}
        </ul>
      ) : !draft ? (
        <EmptyState
          icon={<BellRing />}
          title={t("alerts.emptyTitle")}
          description={t("alerts.emptyDescription")}
          primaryAction={{ label: t("alerts.create"), href: "/talent/alerts?new=1" }}
          secondaryAction={{ label: t("discover.findJobs"), href: "/talent/jobs" }}
        />
      ) : null}
    </div>
  );
}
