import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { BillingStatusBadge } from "@/components/billing/billing-status";
import { DateText } from "@/components/shared/date-text";
import { KeyValueList } from "@/components/shared/key-value-list";
import { MoneyText } from "@/components/shared/money-text";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { env } from "@/lib/env";
import { requireStaff, staffCan } from "@/modules/identity/authz";

import { DisputeDecisionForm } from "../../_components/case-forms";
import { ADMIN_COMMERCIAL, COMMERCIAL_CRUMB } from "../../_lib/nav";
import { getDisputeDetail } from "../../_lib/queries";

export const metadata: Metadata = { title: "Dispute" };

export default async function DisputePage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff("commercial.view");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const data = await getDisputeDetail(staff, id);
  if (!data) notFound();
  const { dispute: d } = data;
  const timeZone = staff.user.timezone ?? env().DEFAULT_TIMEZONE;
  const link = (href: string, text: string) => (
    <a className="text-teal-strong underline underline-offset-4" href={href}>
      {text}
    </a>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Dispute from ${data.organizationName ?? "an individual buyer"}`}
        status={<BillingStatusBadge kind="dispute" status={d.status} size="md" />}
        description={d.source === "chargeback" ? "Chargeback" : "Customer billing query"}
        breadcrumbs={[COMMERCIAL_CRUMB, { label: "Disputes", href: `${ADMIN_COMMERCIAL}/disputes` }, { label: "Dispute" }]}
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <SectionCard title="Details" className="lg:col-span-2">
          <KeyValueList
            columns={2}
            items={[
              { label: "Amount in question", value: d.amountMinor !== null && d.currency ? <MoneyText amountMinor={d.amountMinor} currency={d.currency} /> : "Whole document" },
              { label: "Opened", value: <><DateText value={d.createdAt} mode="datetime" timeZone={timeZone} />{data.openedBy ? ` by ${data.openedBy}` : ""}</> },
              { label: "Invoice", value: d.invoiceId && data.invoice ? link(`${ADMIN_COMMERCIAL}/invoices/${d.invoiceId}`, `${data.invoice.code ?? "Invoice"}`) : "—" },
              { label: "Payment", value: data.payment ? <>{data.payment.code} · <MoneyText amountMinor={data.payment.amountMinor} currency={data.payment.currency} /></> : "—" },
              ...(d.respondBy ? [{ label: "Respond by", value: <DateText value={d.respondBy} timeZone={timeZone} /> }] : []),
              ...(d.resolvedAt ? [{ label: "Closed", value: <DateText value={d.resolvedAt} mode="datetime" timeZone={timeZone} /> }] : []),
              { label: "What the customer said", value: d.reason, fullWidth: true },
              ...(d.resolution ? [{ label: "Answer", value: d.resolution, fullWidth: true }] : []),
            ]}
          />
        </SectionCard>
        <SectionCard title="Decision" description="Refunds are requested separately from the payment, and go through approval.">
          {staffCan(staff, "commercial.refunds") ? (
            <DisputeDecisionForm disputeId={d.id} status={d.status} resolution={d.resolution} />
          ) : (
            <p className="text-sm text-muted-foreground">You need the refunds and disputes permission to update this dispute.</p>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
