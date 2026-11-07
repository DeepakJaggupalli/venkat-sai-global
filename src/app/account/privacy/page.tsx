import type { Metadata } from "next";
import Link from "next/link";

import { ConsentPreferences } from "@/components/privacy/consent-preferences";
import { Callout } from "@/components/shared/callout";
import { DataTable } from "@/components/shared/data-table";
import { DateText } from "@/components/shared/date-text";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { env } from "@/lib/env";
import { sp, type SearchParams } from "@/lib/http";
import { getConsentState } from "@/modules/identity/consent";
import { requireUser } from "@/modules/identity/session";
import { DATA_REQUEST_TYPE_DESCRIPTIONS, DATA_REQUEST_TYPE_LABELS, OPEN_DATA_REQUEST_STATUSES, SELF_SERVICE_REQUEST_TYPES } from "@/modules/privacy/constants";
import { listMyDataRequests } from "@/modules/privacy/queries";
import { getSetting } from "@/modules/settings";

import { DataRequestStatusBadge } from "../../admin/privacy/_components/badges";
import { CancelRequestButton } from "./_components/cancel-request-button";
import { CommunicationConsentsForm } from "./_components/communication-consents-form";
import { DataRequestForm } from "./_components/data-request-form";
import { COMMUNICATION_LABELS, COMMUNICATION_PURPOSES, isChildAccount } from "./_lib";

export const metadata: Metadata = { title: "Privacy and your data" };

const REQUESTER_STATUS_LABELS = { rejected: "Declined", identity_verification: "Confirm your identity" } as const;

/**
 * /account/privacy — every signed-in person's privacy centre (DPDP Act 2023): cookie and analytics
 * choices, communication consents, data requests (export, access, correction, deletion) with their status
 * and export downloads, and account closure (a deletion request).
 */
export default async function AccountPrivacyPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser();
  const params = await searchParams;
  const [requests, consents, child, slaDays] = await Promise.all([
    listMyDataRequests(user.id),
    getConsentState(user.id, [...COMMUNICATION_PURPOSES]),
    isChildAccount(user.id),
    getSetting("privacy.data_request_sla_days"),
  ]);
  const timeZone = user.timezone ?? env().DEFAULT_TIMEZONE;
  const openTypes = new Set(requests.filter((r) => OPEN_DATA_REQUEST_STATUSES.includes(r.status)).map((r) => r.type));
  const readyExports = requests.filter((r) => r.export);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Privacy and your data"
        description="Control how we use your data, get a copy of it, ask us to correct it, or close your account."
        className="pb-0"
      />

      {readyExports.length ? (
        <Callout tone="success" title="Your data export is ready" live="polite">
          Download it below before {readyExports[0]!.export!.expiresAt.toISOString().slice(0, 10)}. After that the file is deleted for your security.
        </Callout>
      ) : null}

      <SectionCard title="Cookies and analytics" description="Choose which optional cookies and measurement we may use on this device." headingLevel="h2">
        <ConsentPreferences source="account_privacy" />
      </SectionCard>

      <SectionCard title="Messages from us" description="Account, security and request updates are always sent. These choices cover optional messages." headingLevel="h2">
        <CommunicationConsentsForm
          items={COMMUNICATION_PURPOSES.map((purpose) => ({
            purpose,
            label: COMMUNICATION_LABELS[purpose].label,
            description: COMMUNICATION_LABELS[purpose].description,
            granted: consents[purpose]?.granted ?? false,
            disabledReason: child && COMMUNICATION_LABELS[purpose].marketing ? "Not available for accounts of people under 18." : null,
          }))}
        />
      </SectionCard>

      <SectionCard id="requests" title="Your data requests" description="Requests you have made and their status." headingLevel="h2" flush>
        <DataTable
          caption="Your data requests"
          rows={requests}
          getRowId={(r) => r.id}
          columns={[
            {
              id: "request",
              header: "Request",
              primary: true,
              cell: (r) => (
                <div className="min-w-0">
                  <p className="font-medium text-foreground">{DATA_REQUEST_TYPE_LABELS[r.type]}</p>
                  <p className="text-xs text-muted-foreground">{r.code}</p>
                  {r.resolution ? <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{r.resolution}</p> : null}
                </div>
              ),
            },
            { id: "status", header: "Status", cell: (r) => <DataRequestStatusBadge status={r.status} labels={REQUESTER_STATUS_LABELS} /> },
            { id: "made", header: "Made", nowrap: true, cell: (r) => <DateText value={r.createdAt} timeZone={timeZone} /> },
            {
              id: "due",
              header: "Response due",
              nowrap: true,
              cell: (r) => (r.completedAt ? <span className="text-muted-foreground">Closed <DateText value={r.completedAt} timeZone={timeZone} /></span> : r.dueAt ? <DateText value={r.dueAt} timeZone={timeZone} /> : "—"),
            },
            {
              id: "actions",
              header: "Actions",
              cell: (r) =>
                r.export ? (
                  <a className="text-sm font-medium text-teal-strong underline underline-offset-4" href={r.export.href} data-testid="export-download">
                    Download export<span className="sr-only"> for {r.code}</span>
                  </a>
                ) : r.exportExpired ? (
                  <span className="text-sm text-muted-foreground">Download expired</span>
                ) : r.canCancel ? (
                  <CancelRequestButton id={r.id} code={r.code} />
                ) : null,
            },
          ]}
          empty={<EmptyState size="sm" title="No requests yet" description="Requests you make below appear here with their status." />}
        />
      </SectionCard>

      <SectionCard title="Make a request" description="Your rights under India's Digital Personal Data Protection Act, 2023." headingLevel="h2">
        <DataRequestForm
          slaDays={Number(slaDays)}
          defaultType={sp(params, "request") ?? undefined}
          options={SELF_SERVICE_REQUEST_TYPES.map((type) => ({
            value: type,
            label: DATA_REQUEST_TYPE_LABELS[type],
            description: DATA_REQUEST_TYPE_DESCRIPTIONS[type],
            disabledReason: openTypes.has(type) ? "You already have an open request of this type." : null,
          }))}
        />
      </SectionCard>

      <SectionCard title="Close your account" headingLevel="h2">
        <div className="space-y-3 text-sm text-muted-foreground">
          <p>
            To close your account, choose “{DATA_REQUEST_TYPE_LABELS.deletion}” above. We confirm the request, then close the account and delete or anonymise your personal data. Records we must keep by law stay, linked to an anonymised account.
          </p>
          <p>
            If something is wrong, you can also{" "}
            <Link className="font-medium text-teal-strong underline underline-offset-4" href="/grievance">
              raise a grievance
            </Link>{" "}
            or read{" "}
            <Link className="font-medium text-teal-strong underline underline-offset-4" href="/legal/data-rights">
              your data rights
            </Link>
            .
          </p>
        </div>
      </SectionCard>
    </div>
  );
}
