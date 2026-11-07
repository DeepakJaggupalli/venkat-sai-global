import type { InvoicePartySnapshot } from "@/db/schema/commercial";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatDate, formatMoney } from "@/lib/format";
import { placeOfSupplyLabel } from "@/modules/commercial/constants";
import { formatRate } from "@/modules/commercial/tax";
import type { InvoiceDocumentView } from "@/modules/commercial/types";

/**
 * Printable invoice / credit note (server component). Everything shown comes from the document itself: the
 * frozen seller and buyer snapshots, the frozen lines and tax components — never live settings — so the printout
 * always matches what was issued. Drafts show the current seller details and a clear "draft" marking.
 */

const TREATMENT_NOTES: Record<string, string> = {
  export: "Export of services — zero-rated supply.",
  sez: "Supply to an SEZ unit — zero-rated supply.",
  exempt: "Exempt supply — no tax charged.",
  reverse_charge: "Tax on this supply is payable by the recipient under reverse charge.",
};

export function documentTitle(doc: Pick<InvoiceDocumentView, "documentType" | "status" | "seller">): string {
  if (doc.documentType === "credit_note") return "Credit note";
  if (doc.status === "draft") return "Draft invoice";
  const gstRegistered = doc.seller?.countryCode === "IN" && Boolean(doc.seller?.taxId);
  return gstRegistered ? "Tax invoice" : "Invoice";
}

function Party({ heading, party }: { heading: string; party: InvoicePartySnapshot | null }) {
  if (!party) {
    return (
      <div>
        <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{heading}</h2>
        <p className="mt-1 text-sm text-muted-foreground">Details are added when the invoice is issued.</p>
      </div>
    );
  }
  const cityLine = [party.city, party.stateRegion, party.postalCode].filter(Boolean).join(", ");
  return (
    <div>
      <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{heading}</h2>
      <address className="mt-1 text-sm leading-relaxed not-italic">
        <span className="block font-semibold text-navy">{party.legalName}</span>
        {party.contactName ? <span className="block">Attn: {party.contactName}</span> : null}
        {party.addressLine1 ? <span className="block">{party.addressLine1}</span> : null}
        {party.addressLine2 ? <span className="block">{party.addressLine2}</span> : null}
        {cityLine ? <span className="block">{cityLine}</span> : null}
        {party.countryCode ? <span className="block">{party.countryCode}</span> : null}
        {party.stateCode && party.countryCode === "IN" ? <span className="block">State code: {placeOfSupplyLabel(party.stateCode)}</span> : null}
        {party.taxId ? (
          <span className="block">
            {party.taxIdType === "gstin" ? "GSTIN" : (party.taxIdType?.toUpperCase() ?? "Tax ID")}: {party.taxId}
          </span>
        ) : null}
        {party.email ? <span className="block break-all">{party.email}</span> : null}
        {party.phone ? <span className="block">{party.phone}</span> : null}
      </address>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="flex justify-between gap-4 sm:block">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium tabular-nums">{value}</dd>
    </div>
  );
}

export function InvoiceDocument({ doc, timeZone, footerNote }: { doc: InvoiceDocumentView; timeZone: string; footerNote: string | null }) {
  const money = (value: number) => formatMoney(value, doc.currency);
  const title = documentTitle(doc);
  const isCredit = doc.documentType === "credit_note";
  const taxNote = doc.taxTreatment === "out_of_scope" ? (doc.seller?.countryCode === "IN" && !doc.seller?.taxId ? "Supplier not registered under GST — no GST charged." : "No tax charged.") : (TREATMENT_NOTES[doc.taxTreatment] ?? null);
  const gstInvoice = title === "Tax invoice" || (isCredit && doc.seller?.countryCode === "IN" && Boolean(doc.seller?.taxId));
  const servicePeriod =
    doc.servicePeriodStart && doc.servicePeriodEnd ? `${formatDate(doc.servicePeriodStart, { timeZone })} – ${formatDate(new Date(doc.servicePeriodEnd.getTime() - 1), { timeZone })}` : null;

  return (
    <article aria-labelledby="invoice-title" className="relative overflow-hidden rounded-xl border border-border bg-white p-5 shadow-xs sm:p-8 print:rounded-none print:border-0 print:p-0 print:shadow-none">
      {doc.status === "draft" || doc.status === "void" ? (
        <p aria-hidden className="pointer-events-none absolute top-1/3 left-1/2 -translate-x-1/2 -rotate-12 text-6xl font-extrabold tracking-widest text-muted-foreground/15 uppercase select-none sm:text-8xl">
          {doc.status === "draft" ? "Draft" : "Void"}
        </p>
      ) : null}

      <header className="flex flex-col gap-6 border-b border-border pb-6 sm:flex-row sm:items-start sm:justify-between">
        <Party heading="From" party={doc.seller} />
        <div className="sm:text-right">
          <h1 id="invoice-title" className="font-heading text-2xl font-bold text-navy">
            {title}
          </h1>
          <p className="mt-1 text-sm font-semibold tabular-nums">{doc.code ?? "Number assigned on issue"}</p>
          <div className="mt-2 sm:flex sm:justify-end">
            <StatusBadge status={doc.status} domain="invoice" />
          </div>
        </div>
      </header>

      <section aria-label="Document details" className="grid gap-6 border-b border-border py-6 sm:grid-cols-2">
        <Party heading={isCredit ? "Credited to" : "Bill to"} party={doc.buyer} />
        <dl className="grid gap-3 sm:grid-cols-2">
          <Meta label={isCredit ? "Credit note date" : "Invoice date"} value={doc.issuedAt ? formatDate(doc.issuedAt, { timeZone }) : null} />
          {!isCredit ? <Meta label="Due date" value={doc.dueAt && doc.status !== "draft" ? formatDate(doc.dueAt, { timeZone }) : null} /> : null}
          <Meta label="Place of supply" value={placeOfSupplyLabel(doc.placeOfSupply)} />
          <Meta label="Currency" value={doc.currency} />
          <Meta label="Service period" value={servicePeriod} />
          <Meta label="Purchase order" value={doc.purchaseOrderReference} />
          {doc.originalInvoice ? <Meta label="Against invoice" value={doc.originalInvoice.code ?? doc.originalInvoice.id} /> : null}
          {gstInvoice ? <Meta label="Tax payable on reverse charge" value={doc.taxTreatment === "reverse_charge" ? "Yes" : "No"} /> : null}
        </dl>
      </section>

      <section aria-labelledby="lines-heading" className="py-6">
        <h2 id="lines-heading" className="sr-only">
          Items
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <caption className="sr-only">Items, taxable values and tax</caption>
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th scope="col" className="py-2 pr-2 font-medium">
                  #
                </th>
                <th scope="col" className="py-2 pr-2 font-medium">
                  Description
                </th>
                <th scope="col" className="py-2 pr-2 font-medium">
                  HSN/SAC
                </th>
                <th scope="col" className="py-2 pr-2 text-right font-medium">
                  Qty
                </th>
                <th scope="col" className="py-2 pr-2 text-right font-medium">
                  Unit price
                </th>
                <th scope="col" className="py-2 pr-2 text-right font-medium">
                  Discount
                </th>
                <th scope="col" className="py-2 pr-2 text-right font-medium">
                  Taxable value
                </th>
                <th scope="col" className="py-2 pr-2 text-right font-medium">
                  Tax
                </th>
                <th scope="col" className="py-2 text-right font-medium">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody>
              {doc.lines.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-6 text-center text-muted-foreground">
                    No items yet.
                  </td>
                </tr>
              ) : (
                doc.lines.map((line, index) => (
                  <tr key={line.id} className="border-b border-border/60 align-top">
                    <td className="py-2 pr-2 tabular-nums">{index + 1}</td>
                    <td className="py-2 pr-2">{line.description}</td>
                    <td className="py-2 pr-2 tabular-nums">{line.taxCode ?? "—"}</td>
                    <td className="py-2 pr-2 text-right tabular-nums">{line.quantity}</td>
                    <td className="py-2 pr-2 text-right tabular-nums">{money(line.unitAmountMinor)}</td>
                    <td className="py-2 pr-2 text-right tabular-nums">{line.discountMinor ? money(line.discountMinor) : "—"}</td>
                    <td className="py-2 pr-2 text-right tabular-nums">{money(line.amountMinor)}</td>
                    <td className="py-2 pr-2 text-right tabular-nums">
                      {line.taxes.length ? (
                        <span className="block">
                          {money(line.taxMinor)}
                          <span className="block text-xs text-muted-foreground">{line.taxes.map((t) => `${t.name.replace(/\s*\d+(\.\d+)?%$/, "")} ${formatRate(t.rateBasisPoints)}`).join(" + ")}</span>
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-2 text-right font-medium tabular-nums">{money(line.amountMinor + line.taxMinor)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-label="Totals and tax breakdown" className="grid gap-6 border-t border-border pt-6 sm:grid-cols-2">
        <div>
          {doc.taxSummary.length ? (
            <table className="w-full border-collapse text-sm">
              <caption className="mb-2 text-left text-xs font-semibold tracking-wide text-muted-foreground uppercase">Tax breakdown</caption>
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th scope="col" className="py-1.5 pr-2 font-medium">
                    Tax
                  </th>
                  <th scope="col" className="py-1.5 pr-2 text-right font-medium">
                    Taxable value
                  </th>
                  <th scope="col" className="py-1.5 text-right font-medium">
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody>
                {doc.taxSummary.map((row) => (
                  <tr key={`${row.kind}-${row.rateBasisPoints}`} className="border-b border-border/60">
                    <th scope="row" className="py-1.5 pr-2 text-left font-normal">
                      {row.name}
                    </th>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{money(row.taxableMinor)}</td>
                    <td className="py-1.5 text-right tabular-nums">{money(row.amountMinor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
          {taxNote ? <p className="mt-3 text-sm text-muted-foreground">{taxNote}</p> : null}
          {doc.couponCode ? <p className="mt-2 text-sm text-muted-foreground">Coupon applied: {doc.couponCode}</p> : null}
        </div>
        <dl className="space-y-1.5 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Subtotal</dt>
            <dd className="tabular-nums">{money(doc.subtotalMinor)}</dd>
          </div>
          {doc.discountMinor ? (
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Discount</dt>
              <dd className="tabular-nums">−{money(doc.discountMinor)}</dd>
            </div>
          ) : null}
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Taxable value</dt>
            <dd className="tabular-nums">{money(doc.subtotalMinor - doc.discountMinor)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Tax</dt>
            <dd className="tabular-nums">{money(doc.taxMinor)}</dd>
          </div>
          <div className="flex justify-between gap-4 border-t border-border pt-2 text-base font-semibold text-navy">
            <dt>{isCredit ? "Total credited" : "Total"}</dt>
            <dd className="tabular-nums">{money(doc.totalMinor)}</dd>
          </div>
          {!isCredit && doc.status !== "draft" ? (
            <>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Paid</dt>
                <dd className="tabular-nums">{money(doc.amountPaidMinor)}</dd>
              </div>
              {doc.amountRefundedMinor ? (
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Refunded</dt>
                  <dd className="tabular-nums">{money(doc.amountRefundedMinor)}</dd>
                </div>
              ) : null}
              <div className="flex justify-between gap-4 font-semibold">
                <dt>Balance due</dt>
                <dd className="tabular-nums">{money(doc.outstandingMinor)}</dd>
              </div>
            </>
          ) : null}
        </dl>
      </section>

      {doc.status === "void" ? (
        <p className="mt-6 rounded-lg bg-surface-subtle p-3 text-sm">
          This invoice was voided{doc.voidedAt ? ` on ${formatDate(doc.voidedAt, { timeZone })}` : ""}
          {doc.voidReason ? `: ${doc.voidReason}` : "."} Nothing is payable on it.
        </p>
      ) : null}

      {doc.payments.length ? (
        <section aria-labelledby="payments-heading" className="mt-6">
          <h2 id="payments-heading" className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Payments received
          </h2>
          <ul className="mt-2 space-y-1 text-sm">
            {doc.payments.map((p) => (
              <li key={p.code} className="flex flex-wrap justify-between gap-2">
                <span>
                  {p.code}
                  {p.receivedAt ? ` · ${formatDate(p.receivedAt, { timeZone })}` : ""}
                </span>
                <span className="tabular-nums">{money(p.amountMinor)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {doc.creditNotes.length ? (
        <section aria-labelledby="credit-notes-heading" className="mt-6">
          <h2 id="credit-notes-heading" className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Credit notes
          </h2>
          <ul className="mt-2 space-y-1 text-sm">
            {doc.creditNotes.map((n) => (
              <li key={n.id} className="flex flex-wrap justify-between gap-2">
                <span>
                  {n.code ?? n.id}
                  {n.issuedAt ? ` · ${formatDate(n.issuedAt, { timeZone })}` : ""}
                </span>
                <span className="tabular-nums">{money(n.totalMinor)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {doc.notes || footerNote ? (
        <footer className="mt-8 space-y-2 border-t border-border pt-4 text-sm text-muted-foreground">
          {doc.notes ? <p className="whitespace-pre-line">{doc.notes}</p> : null}
          {footerNote ? <p className="whitespace-pre-line">{footerNote}</p> : null}
        </footer>
      ) : null}
      <p className="mt-6 text-xs text-muted-foreground">This is a computer-generated document.</p>
    </article>
  );
}
