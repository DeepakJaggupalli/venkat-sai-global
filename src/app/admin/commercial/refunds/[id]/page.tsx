import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { BillingStatusBadge } from "@/components/billing/billing-status";
import { PROVIDER_LABELS } from "@/components/billing/labels";
import { DateText } from "@/components/shared/date-text";
import { KeyValueList } from "@/components/shared/key-value-list";
import { MoneyText } from "@/components/shared/money-text";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { env } from "@/lib/env";
import { requireStaff, staffCan } from "@/modules/identity/authz";

import { CompleteRefundForm, ResubmitRefundForm, RetryRefundButton } from "../../_components/case-forms";
import { ADMIN_COMMERCIAL, COMMERCIAL_CRUMB } from "../../_lib/nav";
import { getRefundDetail } from "../../_lib/queries";

export const metadata: Metadata = { title: "Refund" };

const GATEWAYS = new Set(["razorpay", "stripe"]);

export default async function RefundPage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff("commercial.view");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const data = await getRefundDetail(staff, id);
  if (!data) notFound();
  const { refund: r } = data;
  const timeZone = staff.user.timezone ?? env().DEFAULT_TIMEZONE;
  const canProcess = staffCan(staff, "commercial.refunds");
  const canRequest = staffCan(staff, ["commercial.payments", "commercial.refunds"], "any");
  const gateway = GATEWAYS.has(data.paymentProvider);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Refund ${r.code}`}
        status={<BillingStatusBadge kind="refund" status={r.status} size="md" />}
        description={data.organizationName ?? "Individual buyer"}
        breadcrumbs={[COMMERCIAL_CRUMB, { label: "Refunds", href: `${ADMIN_COMMERCIAL}/refunds` }, { label: r.code }]}
        actions={r.approvalRequestId ? [{ label: "Open approval", href: `/admin/approvals/${r.approvalRequestId}`, variant: "outline" as const }] : []}
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <SectionCard title="Details" className="lg:col-span-2">
          <KeyValueList
            columns={2}
            items={[
              { label: "Amount", value: <MoneyText amountMinor={r.amountMinor} currency={r.currency} /> },
              { label: "Payment", value: `${data.paymentCode} · ${PROVIDER_LABELS[data.paymentProvider]}` },
              { label: "Payment amount", value: <MoneyText amountMinor={data.paymentAmountMinor} currency={r.currency} /> },
              { label: "Already refunded", value: <MoneyText amountMinor={data.paymentRefundedMinor} currency={r.currency} /> },
              { label: "Invoice", value: data.invoiceId ? <a className="text-teal-strong underline underline-offset-4" href={`${ADMIN_COMMERCIAL}/invoices/${data.invoiceId}`}>{data.invoiceCode ?? "Open"}</a> : "Advance payment" },
              { label: "Requested", value: <><DateText value={r.createdAt} mode="datetime" timeZone={timeZone} />{data.requestedBy ? ` by ${data.requestedBy}` : ""}</> },
              ...(r.approvedAt ? [{ label: "Approved", value: <DateText value={r.approvedAt} mode="datetime" timeZone={timeZone} /> }] : []),
              ...(r.processedAt ? [{ label: "Completed", value: <DateText value={r.processedAt} mode="datetime" timeZone={timeZone} /> }] : []),
              ...(r.creditNoteInvoiceId ? [{ label: "Credit note", value: <a className="text-teal-strong underline underline-offset-4" href={`${ADMIN_COMMERCIAL}/invoices/${r.creditNoteInvoiceId}`}>Open credit note</a> }] : []),
              { label: "Reason", value: r.reason, fullWidth: true },
              ...(r.decisionNote ? [{ label: "Approver's note", value: r.decisionNote, fullWidth: true }] : []),
              ...(r.failureReason ? [{ label: "Failure", value: r.failureReason, fullWidth: true }] : []),
            ]}
          />
        </SectionCard>
        <SectionCard title="Next step">
          {r.status === "approved" && !gateway && canProcess ? (
            <CompleteRefundForm refundId={r.id} today={new Date().toISOString().slice(0, 10)} />
          ) : r.status === "failed" && gateway && canProcess ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">The gateway refused the refund. Check the reason, then try again.</p>
              <RetryRefundButton refundId={r.id} />
            </div>
          ) : r.status === "requested" && canRequest ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">Waiting for approval. If the approver asked for changes, update the request and resubmit it.</p>
              <ResubmitRefundForm refundId={r.id} defaultReason={r.reason} />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {r.status === "processing" ? "The gateway is processing the refund." : r.status === "completed" ? "Completed. Nothing else to do." : r.status === "rejected" ? "Rejected by the approver." : "No action available with your permissions."}
            </p>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
