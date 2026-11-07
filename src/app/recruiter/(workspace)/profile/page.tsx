import type { Metadata } from "next";
import { FileText, MapPin, ShieldCheck } from "lucide-react";

import { CompletenessMeter } from "@/components/shared/progress-ring";
import { Callout } from "@/components/shared/callout";
import { DateText } from "@/components/shared/date-text";
import { EmptyState } from "@/components/shared/empty-state";
import { FileList } from "@/components/shared/file-list";
import { KeyValueList } from "@/components/shared/key-value-list";
import { MoneyText } from "@/components/shared/money-text";
import { PageHeader } from "@/components/shared/page-header";
import { SafeHtml } from "@/components/shared/safe-html";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { AGREEMENT_STATUS, daysUntil, labelOf, LICENCE_STATUS } from "@/components/recruiter/labels";
import { env } from "@/lib/env";
import { getFiles, toFileSummary } from "@/modules/files";
import { requireOrgMember } from "@/modules/identity/authz";
import { PARTNER_LICENCE_TYPE_LABELS, PARTNER_TERRITORY_SCOPE_LABELS } from "@/modules/organizations/constants";
import { getPartnerProfile, listPartnerAgreements, listPartnerLicences, listPartnerTerritories } from "@/modules/organizations/partner";
import { getOrganizationOverview } from "@/modules/organizations/queries";
import { countryOptions, industryOptions } from "@/modules/taxonomy/queries";

import { AgencyDetailsForm, PartnerProfileForm } from "./_components/agency-forms";
import { AcceptAgreementForm, RemoveTerritoryButton, TerritoryForm } from "./_components/agreement-territories";
import { AddLicenceButton, LicenceRowActions, type LicenceDefaults } from "./_components/licences";

export const metadata: Metadata = { title: "Agency profile" };

const LOCKED_STATUSES = new Set(["pending", "under_review", "verified", "suspended"]);

const FEE_MODEL_LABELS: Record<string, string> = {
  flat_per_placement: "Fixed fee per placement",
  salary_percentage: "Percentage of annual salary",
  flat_per_selection: "Fixed fee per selection",
  none: "No fee",
  custom: "Custom terms",
};

export default async function RecruiterProfilePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireOrgMember("recruitment_partner", "partner.profile.manage");
  const orgId = ctx.organization.id;
  const timeZone = ctx.user.timezone ?? env().DEFAULT_TIMEZONE;
  const sp = await searchParams;
  const [overview, profile, licences, agreements, territories, countries, industries] = await Promise.all([
    getOrganizationOverview(ctx, orgId),
    getPartnerProfile(ctx, orgId),
    listPartnerLicences(ctx, orgId),
    listPartnerAgreements(ctx, orgId),
    listPartnerTerritories(ctx, orgId),
    countryOptions(),
    industryOptions(),
  ]);
  const org = overview.organization;
  const readiness = overview.readiness;
  const countryName = new Map(countries.map((c) => [c.value, c.label]));
  const licenceFiles = new Map((await getFiles(licences.map((l) => l.fileId).filter((id): id is string => Boolean(id)))).map((f) => [f.id, toFileSummary(f)]));
  const activeAgreement = agreements.find((a) => a.status === "active") ?? null;
  const pendingAgreement = agreements.find((a) => a.status === "pending") ?? null;
  const shownAgreements = [pendingAgreement, activeAgreement].filter((a): a is NonNullable<typeof a> => Boolean(a));
  const pastAgreements = agreements.filter((a) => a.status !== "active" && a.status !== "pending");
  const verifiedLicence = licences.some((l) => l.verificationStatus === "verified");
  const profileIssues = readiness.issues.filter((i) => ["name", "country", "city", "contact"].includes(i.code));

  const checklist = [
    { id: "details", label: "Agency details and official contact", done: profileIssues.length === 0, href: "#details" },
    { id: "services", label: "Business type and services", done: Boolean(profile?.businessType) && (profile?.servicesProvided.length ?? 0) > 0, href: "#services" },
    {
      id: "licence",
      label: readiness.licence?.required ? "Recruitment licence on record" : "Licences (if you hold any)",
      done: readiness.licence?.required ? readiness.licence.satisfied : true,
      href: "#licences",
      hint: readiness.licence?.required ? readiness.licence.message : undefined,
    },
    { id: "territories", label: "Territories declared", done: territories.length > 0, href: "#territories" },
    { id: "documents", label: "Registration documents uploaded", done: readiness.documentRequirements.every((d) => d.met), href: "/recruiter/profile/verification" },
    { id: "agreement", label: "Partner agreement accepted", done: Boolean(activeAgreement), href: "#agreement", hint: activeAgreement ? undefined : "Venkat Sai issues the agreement to you; it appears below." },
    { id: "verification", label: "Agency verified by Venkat Sai", done: org.status === "verified", href: "/recruiter/profile/verification" },
  ];

  const toLicenceDefaults = (l: (typeof licences)[number]): LicenceDefaults => ({
    id: l.id,
    licenceType: l.licenceType,
    licenceNumber: l.licenceNumber,
    issuingAuthority: l.issuingAuthority,
    issuingCountryCode: l.issuingCountryCode,
    issuingRegion: l.issuingRegion,
    validFrom: l.validFrom,
    validUntil: l.validUntil,
    holderName: l.details.holderName ?? null,
    registeredAddress: l.details.registeredAddress ?? null,
    authorisedActivities: l.details.authorisedActivities ?? [],
    branchOffices: l.details.branchOffices ?? [],
    file: l.fileId ? (licenceFiles.get(l.fileId) ?? null) : null,
  });
  const industryLabel = new Map(industries.map((i) => [i.value, i]));

  return (
    <div className="space-y-8">
      <PageHeader
        title="Agency profile"
        description="Your registered details, services, licences, territories and partner agreement. Venkat Sai uses them to verify your agency and assign requirements."
        status={<StatusBadge status={org.status} domain="organization" />}
        actions={[{ label: "Verification and documents", href: "/recruiter/profile/verification", icon: <ShieldCheck aria-hidden="true" /> }]}
      />

      {sp.welcome === "1" ? (
        <Callout tone="success" title="Your partner workspace is ready" live="polite">
          Complete the steps below, then submit your agency for verification. You can submit candidates once Venkat Sai has verified your agency.
        </Callout>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <SectionCard id="details" title="Agency details" description="Registered entity, address and official contact.">
            <AgencyDetailsForm
              identityLocked={LOCKED_STATUSES.has(org.status)}
              countries={countries}
              industries={industries}
              defaults={{
                name: org.name,
                legalName: org.legalName,
                description: org.description,
                websiteUrl: org.websiteUrl,
                email: org.email,
                phone: org.phone,
                industryId: org.industryId,
                countryCode: org.countryCode,
                stateRegion: org.stateRegion,
                city: org.city,
                addressLine1: org.addressLine1,
                addressLine2: org.addressLine2,
                postalCode: org.postalCode,
                registrationNumber: org.registrationNumber,
                taxId: org.taxId,
              }}
            />
          </SectionCard>

          <SectionCard id="services" title="Services and specialisations">
            <PartnerProfileForm
              industries={industries}
              defaults={{
                businessType: profile?.businessType ?? null,
                servicesProvided: profile?.servicesProvided ?? [],
                yearsInOperation: profile?.yearsInOperation ?? null,
                specialisations: profile?.specialisations ?? [],
                industries: (profile?.industryIds ?? []).map((id) => industryLabel.get(id)).filter((o): o is NonNullable<typeof o> => Boolean(o)),
                placementsClaimed: profile?.placementsClaimed ?? null,
              }}
            />
          </SectionCard>

          <SectionCard
            id="licences"
            title="Licences"
            description="Recruitment and trade licences with their validity. Overseas recruitment needs an active, verified recruitment licence."
            action={<AddLicenceButton organizationId={orgId} countries={countries} />}
            flush
          >
            {readiness.licence?.required && !readiness.licence.satisfied ? (
              <div className="px-5 pt-5">
                <Callout tone="warning" title="A recruitment licence is needed">
                  {readiness.licence.message}
                </Callout>
              </div>
            ) : null}
            {licences.length ? (
              <ul className="divide-y divide-border">
                {licences.map((l) => {
                  const status = labelOf(LICENCE_STATUS, l.verificationStatus);
                  const days = daysUntil(l.validUntil);
                  const file = l.fileId ? licenceFiles.get(l.fileId) : undefined;
                  return (
                    <li key={l.id} className="space-y-3 px-5 py-4" data-testid="partner-licence">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <p className="font-medium text-foreground">{PARTNER_LICENCE_TYPE_LABELS[l.licenceType]}</p>
                          <p className="text-sm break-words text-muted-foreground">
                            No. {l.licenceNumber} · {countryName.get(l.issuingCountryCode) ?? l.issuingCountryCode}
                            {l.issuingAuthority ? ` · ${l.issuingAuthority}` : ""}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {l.validUntil ? (
                              <>
                                Valid until <DateText value={l.validUntil} dateOnly />
                                {days !== null && days >= 0 && days <= 60 ? <span className="font-medium text-warning-strong"> · expires in {days} days</span> : null}
                                {days !== null && days < 0 ? <span className="font-medium text-danger-strong"> · expired</span> : null}
                              </>
                            ) : (
                              "No expiry printed"
                            )}
                          </p>
                        </div>
                        <StatusBadge tone={status.tone} size="sm">
                          {status.label}
                        </StatusBadge>
                      </div>
                      {file ? <FileList label={`Scan of licence ${l.licenceNumber}`} files={[{ id: file.id, name: file.name, size: file.size ?? undefined, mimeType: file.mimeType, href: file.url }]} /> : <p className="text-sm text-muted-foreground">No scan uploaded yet. Add one so Venkat Sai can verify the licence.</p>}
                      {l.verificationStatus === "rejected" && l.rejectionReason ? (
                        <Callout tone="warning" title="Why it was not verified">
                          {l.rejectionReason}
                        </Callout>
                      ) : null}
                      <LicenceRowActions organizationId={orgId} countries={countries} licence={toLicenceDefaults(l)} canDelete={l.verificationStatus !== "verified"} />
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="p-5">
                <EmptyState
                  size="sm"
                  variant="plain"
                  icon={<FileText aria-hidden="true" />}
                  title="No licences yet"
                  description="Add your Recruiting Agent registration (India) or the recruitment licence issued in your country, with a scan of the certificate."
                />
              </div>
            )}
          </SectionCard>

          <SectionCard id="agreement" title="Partner agreement" description="The terms you work under with Venkat Sai, including your commission terms.">
            {shownAgreements.length ? (
              <div className="space-y-6">
                {shownAgreements.map((a) => {
                  const status = labelOf(AGREEMENT_STATUS, a.status);
                  const terms = a.commercialTerms;
                  return (
                    <article key={a.id} className="space-y-4" aria-labelledby={`agreement-${a.id}`} data-testid="partner-agreement">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <h3 id={`agreement-${a.id}`} className="font-heading text-base font-semibold text-navy">
                            {a.title}
                          </h3>
                          <p className="text-sm text-muted-foreground">
                            Version {a.version} · issued <DateText value={a.issuedAt} timeZone={timeZone} />
                          </p>
                        </div>
                        <StatusBadge tone={status.tone} size="sm">
                          {status.label}
                        </StatusBadge>
                      </div>
                      <KeyValueList
                        columns={2}
                        dense
                        items={[
                          { label: "Fee model", value: terms.feeModel ? FEE_MODEL_LABELS[terms.feeModel] : null },
                          { label: "Fee", value: terms.amountMinor !== undefined && terms.currency ? <MoneyText amountMinor={terms.amountMinor} currency={terms.currency} /> : terms.rateBasisPoints !== undefined ? `${terms.rateBasisPoints / 100}%` : null },
                          { label: "Payable", value: terms.payableAfterJoiningDays !== undefined ? `${terms.payableAfterJoiningDays} days after the candidate joins` : null },
                          { label: "Replacement window", value: terms.replacementWindowDays !== undefined ? `${terms.replacementWindowDays} days` : null },
                          { label: "Effective", value: a.effectiveFrom ? <DateText value={a.effectiveFrom} dateOnly /> : null },
                          { label: "Until", value: a.effectiveUntil ? <DateText value={a.effectiveUntil} dateOnly /> : null },
                          ...(a.acceptedAt ? [{ label: "Accepted", value: <span>{a.acceptedByName} on <DateText value={a.acceptedAt} mode="datetime" timeZone={timeZone} /></span> }] : []),
                        ]}
                        emptyText="Not specified"
                      />
                      {terms.notes ? <p className="text-sm text-muted-foreground">{terms.notes}</p> : null}
                      <details className="group rounded-lg border border-border" open={a.status === "pending"}>
                        <summary className="cursor-pointer rounded-lg px-4 py-3 text-sm font-medium text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                          Read the full agreement
                        </summary>
                        <div className="max-h-[28rem] overflow-y-auto border-t border-border px-4 py-4" tabIndex={0} aria-label={`Text of ${a.title}`}>
                          <SafeHtml html={a.termsSnapshot} />
                        </div>
                      </details>
                      {a.status === "pending" ? <AcceptAgreementForm agreementId={a.id} version={a.version} defaultName={ctx.user.displayName} /> : null}
                    </article>
                  );
                })}
              </div>
            ) : (
              <EmptyState size="sm" variant="plain" title="No agreement issued yet" description="Venkat Sai issues the partner agreement during onboarding. It will appear here for you to read and accept." />
            )}
            {pastAgreements.length ? (
              <p className="mt-4 text-sm text-muted-foreground">
                Earlier versions: {pastAgreements.map((a) => `${a.version} (${labelOf(AGREEMENT_STATUS, a.status).label.toLowerCase()})`).join(", ")}.
              </p>
            ) : null}
          </SectionCard>

          <SectionCard id="territories" title="Territories" description="Where you source candidates or support placements. Venkat Sai authorises each one after checking your licences cover it.">
            {territories.length ? (
              <ul className="mb-6 divide-y divide-border rounded-lg border border-border">
                {territories.map((t) => {
                  const label = `${t.stateRegion ? `${t.stateRegion}, ` : ""}${countryName.get(t.countryCode) ?? t.countryCode}`;
                  return (
                    <li key={t.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between" data-testid="partner-territory">
                      <div className="flex min-w-0 items-start gap-2">
                        <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                        <div>
                          <p className="font-medium text-foreground">{label}</p>
                          <p className="text-sm text-muted-foreground">{PARTNER_TERRITORY_SCOPE_LABELS[t.scope]}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusBadge tone={t.isAuthorised ? "success" : "neutral"} size="sm">
                          {t.isAuthorised ? "Authorised" : "Awaiting authorisation"}
                        </StatusBadge>
                        <RemoveTerritoryButton territoryId={t.id} label={label} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="mb-4 text-sm text-muted-foreground">No territories declared yet.</p>
            )}
            <TerritoryForm countries={countries} />
          </SectionCard>
        </div>

        <aside className="min-w-0 space-y-6" aria-label="Setup progress">
          <CompletenessMeter
            title="Partner setup"
            description="What Venkat Sai needs before verifying your agency."
            items={checklist}
            maxOutstanding={7}
            completeText="Your agency is verified and fully set up."
          />
          <SectionCard title="Verification">
            <KeyValueList
              items={[
                { label: "Status", value: <StatusBadge status={org.status} domain="organization" size="sm" /> },
                { label: "Verified on", value: org.verifiedAt ? <DateText value={org.verifiedAt} timeZone={timeZone} /> : null },
                { label: "Valid until", value: org.verificationExpiresAt ? <DateText value={org.verificationExpiresAt} timeZone={timeZone} /> : null },
                { label: "Verified recruitment licence", value: verifiedLicence ? "Yes" : "Not yet" },
              ]}
              emptyText="Not yet"
            />
          </SectionCard>
          <Callout tone="neutral" title="Candidates never pay">
            Venkat Sai Global never charges candidates to apply, be submitted, interviewed or placed. Partners must not ask candidates for fees for these opportunities.
          </Callout>
        </aside>
      </div>
    </div>
  );
}
