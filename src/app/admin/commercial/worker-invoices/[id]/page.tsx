import { Download, FileText, MessageCircle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { DateText } from "@/components/shared/date-text";
import { KeyValueList } from "@/components/shared/key-value-list";
import { MoneyText } from "@/components/shared/money-text";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { whatsappHref } from "@/config/contact";
import { absoluteUrl, env } from "@/lib/env";
import { formatDate, formatMoney } from "@/lib/format";
import type { SearchParams } from "@/lib/http";
import { ADMIN_COMMERCIAL_PATHS } from "@/modules/commercial/constants";
import { getWorkerInvoice, WORKER_INVOICES_ADMIN_PATH, type WorkerInvoiceDetail } from "@/modules/commercial/worker-invoices";
import { requireStaff, staffCan } from "@/modules/identity/authz";
import { EMPLOYER_KIND_LABELS, EMPLOYER_PORTAL_BASE, portalForEmployerKind } from "@/modules/organizations/employer-kind";

import { COMMERCIAL_CRUMB } from "../../_lib/nav";
import { DeleteWorkerDraftButton } from "../_components/delete-draft-button";
import { WorkerInvoiceEditor } from "../_components/editor";

export const metadata: Metadata = { title: "Worker invoice" };

type PageProps = { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> };

/** A plain link (not next/link): the PDF comes from a route handler as a download. */
function PdfButton({ href, label, variant = "default" }: { href: string; label: string; variant?: "default" | "outline" }) {
  return (
    <Button asChild variant={variant} className="min-h-11 rounded-full px-5">
      <a href={href} download>
        <Download aria-hidden="true" />
        {label}
      </a>
    </Button>
  );
}

/** WhatsApp to the organisation's own number with the invoice number, amount, due date and where to download it. */
function organisationWhatsApp(detail: WorkerInvoiceDetail, timeZone: string): string | null {
  const org = detail.organization;
  const phone = org?.billingPhone ?? org?.phone ?? null;
  if (!org || !phone || !detail.invoice.code) return null;
  const portal = EMPLOYER_PORTAL_BASE[portalForEmployerKind(org.kind)];
  const workers = detail.lines.length === 1 ? "1 worker" : `${detail.lines.length} workers`;
  const due = detail.invoice.dueAt && detail.outstandingMinor > 0 ? ` Due by ${formatDate(detail.invoice.dueAt, { timeZone })}.` : "";
  const message = `Hello ${org.name}, this is Venkat Sai Global. Invoice ${detail.invoice.code} for ${workers}: ${formatMoney(detail.invoice.totalMinor, detail.invoice.currency)}.${due} You can download the PDF under Billing → Invoices: ${absoluteUrl(`${portal}/billing/invoices`)}`;
  return whatsappHref(message, phone);
}

/**
 * /admin/commercial/worker-invoices/[id] — a draft opens in the editor (commercial.invoices); an issued invoice shows
 * the workers, totals, the PDF and a WhatsApp message to the organisation. Payments and voiding stay on the full
 * invoice record (/admin/commercial/invoices/[id]).
 */
export default async function WorkerInvoicePage({ params, searchParams }: PageProps) {
  const staff = await requireStaff("commercial.view");
  const { id } = await params;
  const detail = await getWorkerInvoice(staff, id);
  if (!detail) notFound();
  const sp = await searchParams;
  const { invoice, organization } = detail;
  const timeZone = staff.user.timezone ?? env().DEFAULT_TIMEZONE;
  const isDraft = invoice.status === "draft";
  const canInvoice = staffCan(staff, "commercial.invoices");
  const pdfHref = `${WORKER_INVOICES_ADMIN_PATH}/${invoice.id}/pdf`;
  const crumbs = [COMMERCIAL_CRUMB, { label: "Worker invoices", href: WORKER_INVOICES_ADMIN_PATH }, { label: invoice.code ?? "Draft" }];

  if (isDraft && canInvoice) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Draft worker invoice"
          status={<StatusBadge status="draft" domain="invoice" />}
          description={organization ? `For ${organization.name}. Check the workers and amounts, then issue it.` : undefined}
          breadcrumbs={crumbs}
          actions={[<PdfButton key="pdf" href={pdfHref} label="Preview PDF" variant="outline" />]}
        />
        <WorkerInvoiceEditor staff={staff} searchParams={sp} organizationId={invoice.organizationId} draft={detail} />
        <div className="flex justify-end">
          <DeleteWorkerDraftButton invoiceId={invoice.id} listHref={WORKER_INVOICES_ADMIN_PATH} />
        </div>
      </div>
    );
  }

  const whatsapp = organisationWhatsApp(detail, timeZone);
  return (
    <div className="space-y-6">
      <PageHeader
        title={invoice.code ? `Invoice ${invoice.code}` : "Draft worker invoice"}
        status={<StatusBadge status={invoice.status} domain="invoice" />}
        description={organization ? `${organization.name} · ${EMPLOYER_KIND_LABELS[organization.kind]}` : undefined}
        breadcrumbs={crumbs}
        actions={[
          <PdfButton key="pdf" href={pdfHref} label="Download PDF" />,
          <Button key="record" asChild variant="outline" className="min-h-11 rounded-full px-5">
            <Link href={ADMIN_COMMERCIAL_PATHS.invoice(invoice.id)}>
              <FileText aria-hidden="true" />
              Payments and full record
            </Link>
          </Button>,
        ]}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <SectionCard title="Summary" className="lg:col-span-2">
          <KeyValueList
            columns={2}
            items={[
              { label: "Total", value: <MoneyText amountMinor={invoice.totalMinor} currency={invoice.currency} /> },
              { label: "Balance due", value: <MoneyText amountMinor={detail.outstandingMinor} currency={invoice.currency} /> },
              { label: "Before tax", value: <MoneyText amountMinor={invoice.subtotalMinor} currency={invoice.currency} /> },
              { label: "Tax", value: <MoneyText amountMinor={invoice.taxMinor} currency={invoice.currency} /> },
              { label: "Issued", value: invoice.issuedAt ? <DateText value={invoice.issuedAt} timeZone={timeZone} /> : "Not yet" },
              { label: "Due", value: invoice.dueAt && !isDraft ? <DateText value={invoice.dueAt} timeZone={timeZone} /> : "—" },
              ...(invoice.notes ? [{ label: "Note on the invoice", value: invoice.notes, fullWidth: true }] : []),
            ]}
          />
        </SectionCard>
        <SectionCard title="Send it" description="The organisation can also download it from Billing in their portal.">
          <div className="flex flex-col gap-3">
            {whatsapp ? (
              <Button asChild className="h-12 rounded-full px-6 text-base">
                <a href={whatsapp} target="_blank" rel="noopener noreferrer">
                  <MessageCircle aria-hidden="true" />
                  WhatsApp {organization?.name}
                </a>
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">{invoice.code ? "No phone number on record for this organisation. Add one in its billing details." : "Issue the invoice before sending it."}</p>
            )}
            <Button asChild variant="outline" className="h-12 rounded-full px-6 text-base">
              <a href={pdfHref} download>
                <Download aria-hidden="true" />
                Download PDF
              </a>
            </Button>
          </div>
        </SectionCard>
      </div>

      <SectionCard title={`Workers on this invoice (${detail.lines.length})`} flush>
        <ol className="divide-y divide-border">
          {detail.lines.map((line, index) => (
            <li key={`${line.submissionId}-${index}`} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <span className="min-w-0 break-words">
                {index + 1}. {line.description.replace(/^Recruitment service charge - /, "")}
              </span>
              <span className="shrink-0 text-sm tabular-nums">
                <MoneyText amountMinor={line.amountMinor} currency={invoice.currency} />
                {line.taxMinor ? (
                  <span className="text-muted-foreground">
                    {" "}
                    + tax <MoneyText amountMinor={line.taxMinor} currency={invoice.currency} />
                  </span>
                ) : null}
              </span>
            </li>
          ))}
        </ol>
      </SectionCard>
    </div>
  );
}
