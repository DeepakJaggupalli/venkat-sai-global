import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Callout } from "@/components/shared/callout";
import { env } from "@/lib/env";
import { formatMoney } from "@/lib/format";
import { getInvoiceFooter } from "@/modules/commercial/config";
import { ADMIN_COMMERCIAL_PATHS, PORTAL_BILLING_PATH } from "@/modules/commercial/constants";
import { getInvoiceForViewer } from "@/modules/commercial/queries";
import { requireUser } from "@/modules/identity/session";

import { BillingFrame } from "../../_components/billing-frame";
import { documentTitle, InvoiceDocument } from "../../_components/invoice-document";
import { PayOnline } from "../../_components/pay-online";
import { PrintButton } from "../../_components/print-button";

export const metadata: Metadata = {
  title: "Invoice",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

type PageProps = { params: Promise<{ id: string }> };

/** A4 page and print colours (inline: the global stylesheet is owned by the design system). */
const PRINT_CSS = "@page { size: A4; margin: 14mm; } @media print { html, body { background: #fff !important; } }";

/**
 * /billing/invoices/[id] — printable invoice / credit note for: members of the invoice's organisation with its billing
 * permission (employer.billing.view, partner.billing.manage, institution.billing.manage), the individual buyer, or
 * staff with commercial.view (drafts too). Anyone else gets a 404 (no hint that the invoice exists).
 */
export default async function InvoicePage({ params }: PageProps) {
  const { id } = await params;
  const user = await requireUser({ returnTo: `/billing/invoices/${id}` });
  const data = await getInvoiceForViewer(id);
  if (!data) notFound();
  const { document: doc, access } = data;
  const timeZone = user.timezone ?? env().DEFAULT_TIMEZONE;
  const footer = await getInvoiceFooter();

  const back =
    access.viewer === "staff"
      ? { href: ADMIN_COMMERCIAL_PATHS.invoice(doc.id), label: "Back to the Command Centre" }
      : access.viewer === "member" && access.organizationType
        ? { href: PORTAL_BILLING_PATH[access.organizationType], label: "Back to billing" }
        : { href: "/talent", label: "Back to your account" };
  const showPayment = doc.documentType === "invoice" && doc.outstandingMinor > 0 && access.viewer !== "staff";

  return (
    <BillingFrame width="wide" actions={<PrintButton />}>
      <style>{PRINT_CSS}</style>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={back.href} className="inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-teal-strong hover:underline">
          <ArrowLeft className="size-4" aria-hidden />
          {back.label}
        </Link>
        <p className="text-sm text-muted-foreground">
          {documentTitle(doc)} {doc.code ?? ""}
        </p>
      </div>

      {showPayment ? (
        <section aria-labelledby="pay-heading" className="mb-6 space-y-4 rounded-xl border border-border bg-white p-5 sm:p-6 print:hidden">
          <div>
            <h2 id="pay-heading" className="font-heading text-lg font-semibold text-navy">
              {formatMoney(doc.outstandingMinor, doc.currency)} due{doc.dueAt ? ` by ${new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone }).format(doc.dueAt)}` : ""}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">Quote the invoice number {doc.code} with any payment.</p>
          </div>
          {access.canPayOnline ? <PayOnline invoiceId={doc.id} providers={access.paymentOptions} /> : null}
          {access.onlinePaymentNote ? <Callout tone="info">{access.onlinePaymentNote}</Callout> : null}
          {footer.paymentInstructions ? (
            <div className="rounded-lg bg-surface-subtle p-4 text-sm">
              <h3 className="font-semibold text-navy">Pay by bank transfer, UPI or cheque</h3>
              <p className="mt-1 whitespace-pre-line">{footer.paymentInstructions}</p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {access.canPayOnline ? "You can also pay by bank transfer or UPI: " : "To pay by bank transfer, UPI or cheque, "}
              ask the Venkat Sai finance team for the payment details, then share the transaction reference so the payment can be recorded.
            </p>
          )}
        </section>
      ) : null}

      <InvoiceDocument doc={doc} timeZone={timeZone} footerNote={footer.note} />
    </BillingFrame>
  );
}

