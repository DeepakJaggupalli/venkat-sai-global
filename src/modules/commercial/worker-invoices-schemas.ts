/**
 * Zod schemas for per-worker invoices (client-safe). Amounts are decimal strings, checked against the currency's
 * decimals by the service (worker-invoices-rules.ts → buildWorkerInvoiceLines).
 */
import { z } from "zod";

import { f } from "@/lib/validation";

import { decimalAmount } from "./schemas";
import { MAX_WORKERS_PER_INVOICE } from "./worker-invoices-rules";

export const workerInvoiceLineSchema = z.object({
  submissionId: z.uuid("This worker could not be found"),
  amount: decimalAmount("Amount"),
});

/** The worker invoice form (`lines:json` = [{ submissionId, amount }]; `intent` from the button pressed). */
export const workerInvoiceFormSchema = z.object({
  /** The draft being edited. */
  id: f.optionalUuid(),
  organizationId: z.uuid("Choose who pays this invoice"),
  currency: z.string({ error: "Choose the currency" }).trim().regex(/^[A-Za-z]{3}$/, "Choose the currency").toUpperCase(),
  lines: z
    .array(workerInvoiceLineSchema, { error: "Tick at least one worker" })
    .min(1, "Tick at least one worker")
    .max(MAX_WORKERS_PER_INVOICE, `Put at most ${MAX_WORKERS_PER_INVOICE} workers on one invoice`),
  notes: f.longText(2000),
  intent: z.enum(["draft", "issue"]).catch("draft"),
});
export type WorkerInvoiceFormInput = z.output<typeof workerInvoiceFormSchema>;

/** Filters of the worker picker (URL). */
export const invoiceableWorkerFiltersSchema = z.object({
  q: z.string().trim().min(1).max(100).optional().catch(undefined),
  requirement: z.uuid().optional().catch(undefined),
  /** "1" = only workers already marked as supplied to the chosen organisation. */
  placed: z.preprocess((v) => (v === "1" || v === true ? true : undefined), z.literal(true).optional()).catch(undefined),
});
export type InvoiceableWorkerFilters = z.output<typeof invoiceableWorkerFiltersSchema>;

/** Filters of the worker invoice list (URL). */
export const workerInvoiceListFiltersSchema = z.object({
  q: z.string().trim().min(1).max(100).optional().catch(undefined),
  status: z.enum(["draft", "open", "paid", "void"]).optional().catch(undefined),
  organizationId: z.uuid().optional().catch(undefined),
});
export type WorkerInvoiceListFilters = z.output<typeof workerInvoiceListFiltersSchema>;

export const workerInvoiceIdSchema = z.object({ invoiceId: z.uuid() });
