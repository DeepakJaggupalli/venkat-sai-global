/**
 * Per-worker invoices — pure rules (client-safe, unit-tested).
 *
 * When the office supplies workers to a travel agency or company, staff bill that organisation with one invoice line
 * per worker: "Recruitment service charge - <Name> (<Trade>)", quantity 1, the amount staff enter, in a currency chosen
 * explicitly. Lines point back at the CV submission (referenceType "cv_submission", referenceId = submission id), so a
 * worker is never billed twice to the same organisation unless the earlier invoice was voided. Workers (candidates)
 * are never invoiced.
 */
import type { CvSubmissionStatus } from "@/db/schema/cv-submissions";
import type { InvoiceStatus } from "@/db/schema/commercial";

import { minorUnitsFor, parseDecimalToMinor } from "./money";

export const WORKER_INVOICE_REFERENCE_TYPE = "cv_submission";

/** Stages from which a worker may be invoiced: selected by the employer, or further along the journey. */
export const INVOICEABLE_WORKER_STATUSES = ["selected", "medical", "visa", "ticket", "departed"] as const satisfies readonly CvSubmissionStatus[];
export type InvoiceableWorkerStatus = (typeof INVOICEABLE_WORKER_STATUSES)[number];

/** Stage names as staff know them (same words as the CV submissions list). */
export const WORKER_STATUS_LABELS: Record<CvSubmissionStatus, string> = {
  received: "CV received",
  contacted: "Contacted",
  trade_test: "Trade test / interview",
  selected: "Selected",
  medical: "Medical",
  visa: "Visa",
  ticket: "Ticket",
  departed: "Departed",
  not_suitable: "Not suitable",
  on_hold: "On hold",
};

/** One invoice line per worker; the generic invoice editor allows 100 lines, so do we. */
export const MAX_WORKERS_PER_INVOICE = 100;

/** Invoice line descriptions are limited to 300 characters (manual invoice schema). */
const MAX_DESCRIPTION = 300;

export function isInvoiceableWorkerStatus(status: string): status is InvoiceableWorkerStatus {
  return (INVOICEABLE_WORKER_STATUSES as readonly string[]).includes(status);
}

function clean(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/** "Recruitment service charge - Ravi Kumar (TIG welder)", within the 300-character line limit. */
export function workerLineDescription(worker: { name: string; tradeLabel: string }): string {
  const name = clean(worker.name) || "Worker";
  const trade = clean(worker.tradeLabel);
  const full = trade ? `Recruitment service charge - ${name} (${trade})` : `Recruitment service charge - ${name}`;
  if (full.length <= MAX_DESCRIPTION) return full;
  // Very long names or trades: shorten each part, keep the shape.
  const shortName = name.length > 120 ? `${name.slice(0, 119)}…` : name;
  const room = MAX_DESCRIPTION - `Recruitment service charge - ${shortName} ()`.length;
  const shortTrade = trade.length > room ? `${trade.slice(0, Math.max(0, room - 1))}…` : trade;
  return `Recruitment service charge - ${shortName}${shortTrade ? ` (${shortTrade})` : ""}`.slice(0, MAX_DESCRIPTION);
}

export type WorkerForLine = { id: string; name: string; tradeLabel: string };
export type WorkerAmount = { submissionId: string; amount: string };

/** A draft invoice line for a worker (the invoice service prices it and adds tax). */
export type WorkerInvoiceLine = {
  description: string;
  quantity: 1;
  unitAmount: string;
  referenceType: typeof WORKER_INVOICE_REFERENCE_TYPE;
  referenceId: string;
};

export type LineBuildResult = { ok: true; lines: WorkerInvoiceLine[] } | { ok: false; error: string; fieldErrors: Record<string, string[]> };

/**
 * One line per worker in the order staff ticked them: quantity 1, the amount entered for that worker (decimal string,
 * checked against the currency's decimals; more than zero). Unknown or repeated workers are refused.
 */
export function buildWorkerInvoiceLines(workers: readonly WorkerForLine[], amounts: readonly WorkerAmount[], currency: string, minorUnits?: number | null): LineBuildResult {
  const units = minorUnitsFor(currency, minorUnits);
  const byId = new Map(workers.map((w) => [w.id, w]));
  const seen = new Set<string>();
  const lines: WorkerInvoiceLine[] = [];
  const fieldErrors: Record<string, string[]> = {};
  if (!amounts.length) return { ok: false, error: "Tick at least one worker.", fieldErrors: { lines: ["Tick at least one worker"] } };
  if (amounts.length > MAX_WORKERS_PER_INVOICE) return { ok: false, error: `Put at most ${MAX_WORKERS_PER_INVOICE} workers on one invoice.`, fieldErrors: { lines: ["Too many workers"] } };
  amounts.forEach((entry, index) => {
    const worker = byId.get(entry.submissionId);
    if (!worker) {
      fieldErrors[`lines.${index}.submissionId`] = ["This worker could not be found"];
      return;
    }
    if (seen.has(worker.id)) {
      fieldErrors[`lines.${index}.submissionId`] = [`${clean(worker.name)} is ticked twice`];
      return;
    }
    seen.add(worker.id);
    const parsed = parseDecimalToMinor(entry.amount ?? "", units);
    if (!parsed.ok) {
      fieldErrors[`lines.${index}.amount`] = [`${clean(worker.name)}: ${parsed.error}`];
      return;
    }
    if (parsed.minor <= 0) {
      fieldErrors[`lines.${index}.amount`] = [`${clean(worker.name)}: enter an amount more than zero`];
      return;
    }
    lines.push({ description: workerLineDescription(worker), quantity: 1, unitAmount: entry.amount.trim(), referenceType: WORKER_INVOICE_REFERENCE_TYPE, referenceId: worker.id });
  });
  const messages = Object.values(fieldErrors).flat();
  if (messages.length) return { ok: false, error: messages.length === 1 ? `${messages[0]}.` : `Check the amounts: ${messages.join("; ")}.`, fieldErrors };
  return { ok: true, lines };
}

/**
 * The invoice currency: the one staff chose, else the organisation's billing-profile currency. Never a silent INR —
 * null means staff must choose.
 */
export function pickWorkerInvoiceCurrency(chosen: string | null | undefined, billingProfileCurrency: string | null | undefined): string | null {
  const pick = (v: string | null | undefined) => (typeof v === "string" && /^[A-Za-z]{3}$/.test(v.trim()) ? v.trim().toUpperCase() : null);
  return pick(chosen) ?? pick(billingProfileCurrency);
}

/** A line already billing one of the workers (from any invoice, any organisation). */
export type ExistingWorkerLine = { submissionId: string; invoiceId: string; invoiceCode: string | null; invoiceStatus: InvoiceStatus; organizationId: string | null; documentType?: "invoice" | "credit_note" };

/**
 * Workers already billed to `organizationId` on an invoice that still counts: anything but a voided invoice (drafts
 * count too, so two drafts cannot bill the same worker). `excludeInvoiceId` is the draft being edited. Credit notes
 * never count. One conflict per worker (the first found).
 */
export function findDoubleInvoicing(submissionIds: readonly string[], existing: readonly ExistingWorkerLine[], opts: { organizationId: string; excludeInvoiceId?: string | null }): ExistingWorkerLine[] {
  const wanted = new Set(submissionIds);
  const out = new Map<string, ExistingWorkerLine>();
  for (const line of existing) {
    if (!wanted.has(line.submissionId) || out.has(line.submissionId)) continue;
    if (line.organizationId !== opts.organizationId) continue;
    if (line.documentType === "credit_note") continue;
    if (line.invoiceStatus === "void") continue;
    if (opts.excludeInvoiceId && line.invoiceId === opts.excludeInvoiceId) continue;
    out.set(line.submissionId, line);
  }
  return [...out.values()];
}

/** "Ravi Kumar (VSG/2627/000123)", "Ravi Kumar (a draft invoice)". */
export function describeConflict(name: string, conflict: Pick<ExistingWorkerLine, "invoiceCode" | "invoiceStatus">): string {
  return `${clean(name)} (${conflict.invoiceCode ?? (conflict.invoiceStatus === "draft" ? "a draft invoice" : "an invoice")})`;
}

/** Why a worker opened with ?cv= cannot be ticked, in plain words (null when they can be). */
export function preselectProblem(worker: Pick<InvoiceableWorker, "name" | "status" | "invoiceable" | "alreadyInvoiced"> | undefined, organizationName: string | null): string | null {
  if (!worker) return "The worker you opened this page for could not be found.";
  if (!worker.invoiceable) return `${clean(worker.name)} is at ${WORKER_STATUS_LABELS[worker.status]}. Only workers who are selected, at medical, visa or ticket stage, or departed can be invoiced.`;
  if (worker.alreadyInvoiced) return `${clean(worker.name)} is already on ${worker.alreadyInvoiced.code ?? "a draft invoice"} for ${organizationName ?? "this organisation"}.`;
  return null;
}

/**
 * The amount every worker shares, to prefill "Amount per worker" ("" when the amounts differ or there are none). Lines
 * with another amount keep it: the form never overwrites an amount set for one worker.
 */
export function commonWorkerAmount(amounts: readonly string[]): string {
  const distinct = new Set(amounts.map((a) => a.trim()));
  return distinct.size === 1 ? [...distinct][0]! : "";
}

/** Sum of the entered amounts in minor units, or null while any amount is incomplete (live subtotal in the form). */
export function subtotalMinor(amounts: readonly string[], currency: string | null, minorUnits?: number | null): number | null {
  if (!currency || !amounts.length) return null;
  const units = minorUnitsFor(currency, minorUnits);
  let total = 0;
  for (const amount of amounts) {
    const parsed = parseDecimalToMinor(amount ?? "", units);
    if (!parsed.ok || parsed.minor < 0) return null;
    total += parsed.minor;
  }
  return Number.isSafeInteger(total) ? total : null;
}

// ---------------------------------------------------------------------------
// View types shared by the Command Centre pages and the portal (serialisable)
// ---------------------------------------------------------------------------

/** A worker staff can tick on a worker invoice. Never carries phone numbers or full passport numbers. */
export type InvoiceableWorker = {
  id: string;
  code: string;
  name: string;
  tradeLabel: string;
  status: CvSubmissionStatus;
  /** At an invoiceable stage now (a worker on an older draft may have moved back, e.g. to on hold). */
  invoiceable: boolean;
  passportLast4: string | null;
  requirementTitle: string | null;
  placedOrganizationId: string | null;
  placedOrganizationName: string | null;
  /** A non-void invoice of the chosen organisation that already bills this worker. */
  alreadyInvoiced: { invoiceId: string; code: string | null; status: InvoiceStatus } | null;
};

export type WorkerInvoiceWorker = { submissionId: string; name: string; tradeLabel: string; code: string | null };

export type WorkerInvoiceListItem = {
  id: string;
  code: string | null;
  status: InvoiceStatus;
  currency: string;
  totalMinor: number;
  taxMinor: number;
  outstandingMinor: number;
  issuedAt: Date | null;
  dueAt: Date | null;
  createdAt: Date;
  organizationId: string | null;
  organizationName: string | null;
  workers: WorkerInvoiceWorker[];
};
