import { Download, Eye, FileSearch, Scale, ShieldCheck, Trash2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { ConsentPreferences } from "@/components/privacy/consent-preferences";
import { Callout } from "@/components/shared/callout";
import { DataTable } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Pagination } from "@/components/shared/pagination";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { intlLocaleOf } from "@/components/talent/labels";
import { ConsentsForm, DataRequestForm, DisclosureForm, VisibilityForm, type ConsentRow } from "@/components/talent/privacy/privacy-forms";
import { Button } from "@/components/ui/button";
import { getLocale, getT } from "@/i18n/server";
import { parsePage, type SearchParams } from "@/lib/http";
import { requireCandidate } from "@/modules/candidates/guard";
import { getCandidateProfileDetail, listBlockedOrganizations, listProfileAccessHistory } from "@/modules/candidates/queries";
import { selfActor } from "@/modules/candidates/service";
import { getConsentState } from "@/modules/identity/consent";
import { getSettings } from "@/modules/settings";

import { getAgeGateForCandidate } from "../onboarding/_lib/state";
import { requestCorrection, requestDataExport, requestDeletion, saveConsents, savePrivacySettings, saveVisibility, searchOrganizationsToBlock } from "./actions";
import { ELSEWHERE_PURPOSES, LEDGER_PURPOSES, MINOR_BLOCKED_PURPOSES, MODULE_PURPOSES } from "./_lib/consents";
import { listMyDataRequests } from "./_lib/data-requests";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("talent-account");
  return { title: t("privacy.title") };
}

const PATH = "/talent/privacy";

/**
 * /talent/privacy (spec 8.7): visibility, field-level disclosure, block list, consent dashboard,
 * cookie choices, data rights (download, correction, deletion / closing the account), grievance
 * route and the log of organisations that viewed the candidate's contact details or profile.
 */
export default async function TalentPrivacyPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const session = await requireCandidate();
  const gate = await getAgeGateForCandidate(session.candidate);
  if (gate.state !== "complete") redirect("/talent/onboarding");

  const params = await searchParams;
  const accessPage = parsePage({ page: params.accessPage, pageSize: "10" }, { defaultSize: 10, maxSize: 10 });
  const [t, tp, locale, detail, consentState, requests, access, settings] = await Promise.all([
    getT("talent-account"),
    getT("talent-profile"),
    getLocale(),
    getCandidateProfileDetail(selfActor(session)),
    getConsentState(session.user.id, [...LEDGER_PURPOSES, ...MODULE_PURPOSES, ...ELSEWHERE_PURPOSES]),
    listMyDataRequests(session.user.id),
    listProfileAccessHistory(session, accessPage),
    getSettings(["privacy.data_request_sla_days", "privacy.grievance_ack_hours", "privacy.grievance_resolution_days"]),
  ]);
  if (!detail) redirect("/talent");

  const loc = intlLocaleOf(locale);
  const fmtDate = (d: Date | null) => (d ? new Intl.DateTimeFormat(loc, { day: "numeric", month: "short", year: "numeric" }).format(d) : null);
  const blocked = await listBlockedOrganizations(session, detail.privacy.blockedOrganizationIds);
  const minor = gate.minor;

  const consentRows: ConsentRow[] = [...LEDGER_PURPOSES, ...MODULE_PURPOSES].map((purpose) => ({
    purpose,
    granted: consentState[purpose]?.granted ?? false,
    at: fmtDate(consentState[purpose]?.at ?? null),
    editable: true,
    blockedForMinor: MINOR_BLOCKED_PURPOSES.includes(purpose),
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("privacy.title")}
        description={t("privacy.description")}
        breadcrumbs={[{ label: tp("breadcrumb.portal"), href: "/talent" }, { label: t("privacy.title") }]}
        actions={[{ label: tp("profile.preview"), href: "/talent/profile/preview", icon: <Eye aria-hidden="true" />, variant: "outline" }]}
      />

      {minor ? (
        <Callout tone="info" title={t("privacy.minor.title")}>
          <p>{t("privacy.minor.description")}</p>
        </Callout>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard id="visibility" title={t("visibility.title")} description={t("visibility.description")} headingLevel="h2">
          <VisibilityForm action={saveVisibility} visibility={detail.profile.visibility} isOpenToWork={detail.profile.isOpenToWork} />
        </SectionCard>
        <SectionCard id="disclosure" title={t("disclosure.title")} description={t("disclosure.description")} headingLevel="h2">
          <DisclosureForm
            action={savePrivacySettings}
            search={searchOrganizationsToBlock}
            defaults={{
              showFullNameToEmployers: detail.privacy.showFullNameToEmployers,
              showContactToUnlockedOnly: detail.privacy.showContactToUnlockedOnly,
              showPhoto: detail.privacy.showPhoto,
              showCurrentEmployer: detail.privacy.showCurrentEmployer,
              allowDirectContact: detail.privacy.allowDirectContact,
              allowPartnerSubmissions: detail.privacy.allowPartnerSubmissions,
              blocked: blocked.map((o) => ({ value: o.id, label: o.name })),
            }}
          />
        </SectionCard>
      </div>

      <SectionCard id="consents" title={t("consent.title")} description={t("consent.description")} headingLevel="h2" icon={<ShieldCheck aria-hidden="true" className="size-5" />}>
        <ConsentsForm action={saveConsents} rows={consentRows} minor={minor} />
        <div className="mt-6 border-t pt-4">
          <h3 className="text-sm font-semibold">{t("consent.elsewhere")}</h3>
          <ul className="mt-2 space-y-2 text-sm">
            {ELSEWHERE_PURPOSES.map((purpose) => {
              const state = consentState[purpose];
              return (
                <li key={purpose} className="flex flex-col gap-1 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
                  <span>
                    <span className="font-medium">{t(`consent.${purpose}`)}</span>
                    <span className="block text-muted-foreground">{t(`consent.${purpose}.hint`)}</span>
                  </span>
                  <StatusBadge tone={state?.granted ? "success" : "neutral"} size="sm">
                    {state ? (state.granted ? t("consent.given") : t("consent.notGiven")) : t("consent.never")}
                  </StatusBadge>
                </li>
              );
            })}
          </ul>
        </div>
      </SectionCard>

      <SectionCard id="cookies" title={t("cookies.title")} description={t("cookies.description")} headingLevel="h2">
        <ConsentPreferences source="account_privacy" />
      </SectionCard>

      <SectionCard id="requests" title={t("requests.title")} description={t("requests.description", { days: Number(settings["privacy.data_request_sla_days"]) })} headingLevel="h2">
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-3 rounded-lg border p-4">
            <h3 className="flex items-center gap-2 font-semibold">
              <Download aria-hidden="true" className="size-4" />
              {t("requests.export.title")}
            </h3>
            <p className="text-sm text-muted-foreground">{t("requests.export.description")}</p>
            <Button asChild variant="outline" size="sm">
              <a href={`${PATH}/download`} download>
                {t("requests.export.download")}
              </a>
            </Button>
            <p className="text-sm text-muted-foreground">{t("requests.export.full")}</p>
            <DataRequestForm action={requestDataExport} kind="export" />
          </div>
          <div className="space-y-3 rounded-lg border p-4">
            <h3 className="flex items-center gap-2 font-semibold">
              <FileSearch aria-hidden="true" className="size-4" />
              {t("requests.correction.title")}
            </h3>
            <p className="text-sm text-muted-foreground">{t("requests.correction.description")}</p>
            <DataRequestForm action={requestCorrection} kind="correction" />
          </div>
          <div className="space-y-3 rounded-lg border border-danger-soft p-4">
            <h3 className="flex items-center gap-2 font-semibold">
              <Trash2 aria-hidden="true" className="size-4" />
              {t("requests.deletion.title")}
            </h3>
            <p className="text-sm text-muted-foreground">{t("requests.deletion.description")}</p>
            <details className="rounded-md bg-surface-subtle p-3 text-sm">
              <summary className="cursor-pointer font-medium">{t("requests.deletion.effectsTitle")}</summary>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
                <li>{t("requests.deletion.effect1")}</li>
                <li>{t("requests.deletion.effect2")}</li>
                <li>{t("requests.deletion.effect3")}</li>
              </ul>
              <p className="mt-3 font-medium">{t("requests.deletion.retentionTitle")}</p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-muted-foreground">
                <li>{t("requests.deletion.retention1")}</li>
                <li>{t("requests.deletion.retention2")}</li>
                <li>{t("requests.deletion.retention3")}</li>
              </ul>
            </details>
            <DataRequestForm action={requestDeletion} kind="deletion" />
          </div>
        </div>

        <div className="mt-6">
          <h3 className="text-sm font-semibold">{t("requests.mine")}</h3>
          {requests.length ? (
            <DataTable
              caption={t("requests.mine")}
              rows={requests}
              getRowId={(r) => r.id}
              columns={[
                { id: "code", header: t("requests.col.code"), primary: true, cell: (r) => <span className="font-mono text-sm">{r.code}</span> },
                { id: "type", header: t("requests.col.type"), cell: (r) => t(`requests.type.${r.type}`) },
                { id: "status", header: t("requests.col.status"), cell: (r) => <StatusBadge status={r.status} size="sm">{t(`requests.status.${r.status}`)}</StatusBadge> },
                { id: "created", header: t("requests.col.created"), cell: (r) => fmtDate(r.createdAt) },
                { id: "due", header: t("requests.col.due"), cell: (r) => (r.completedAt ? fmtDate(r.completedAt) : fmtDate(r.dueAt)) },
                {
                  id: "file",
                  header: t("requests.col.file"),
                  cell: (r) =>
                    r.export ? (
                      <a className="font-medium text-primary underline-offset-4 hover:underline" href={r.export.href}>
                        {t("requests.file.download", { date: fmtDate(r.export.expiresAt) ?? "" })}
                      </a>
                    ) : r.exportExpired ? (
                      <span className="text-sm text-muted-foreground">{t("requests.file.expired")}</span>
                    ) : null,
                },
              ]}
            />
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">{t("requests.none")}</p>
          )}
        </div>
      </SectionCard>

      <SectionCard id="access-log" title={t("access.title")} description={t("access.description")} headingLevel="h2">
        {access.items.length ? (
          <>
            <DataTable
              caption={t("access.title")}
              rows={access.items}
              getRowId={(r) => `${r.occurredAt.toISOString()}-${r.dataCategory}-${r.organizationName ?? "vs"}`}
              columns={[
                { id: "who", header: t("access.col.who"), primary: true, cell: (r) => (r.byVenkatSai ? t("access.venkatSai") : (r.organizationName ?? t("access.organisation"))) },
                { id: "what", header: t("access.col.what"), cell: (r) => t(`access.category.${r.dataCategory}`) === `access.category.${r.dataCategory}` ? r.dataCategory : t(`access.category.${r.dataCategory}`) },
                { id: "when", header: t("access.col.when"), cell: (r) => fmtDate(r.occurredAt) },
              ]}
            />
            <Pagination
              pathname={PATH}
              searchParams={params}
              param="accessPage"
              page={access.page}
              pageCount={access.pageCount}
              total={access.total}
              pageSize={access.pageSize}
              itemLabel={t("access.itemLabel")}
            />
          </>
        ) : (
          <EmptyState size="sm" title={t("access.empty")} description={t("access.emptyDescription")} />
        )}
      </SectionCard>

      <SectionCard id="grievance" title={t("grievance.title")} headingLevel="h2" icon={<Scale aria-hidden="true" className="size-5" />}>
        <p className="text-sm text-muted-foreground">
          {t("grievance.description", { hours: Number(settings["privacy.grievance_ack_hours"]), days: Number(settings["privacy.grievance_resolution_days"]) })}
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button asChild variant="outline" size="sm">
            <Link href="/grievance">{t("grievance.raise")}</Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href="/legal/privacy-policy">{t("grievance.policy")}</Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href="/legal/data-rights">{t("grievance.rights")}</Link>
          </Button>
        </div>
      </SectionCard>
    </div>
  );
}
