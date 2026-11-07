import "server-only";

import { sql } from "drizzle-orm";

import { db, type DbOrTx } from "@/db";

import { financialYearLabel } from "./fiscal";

/**
 * Human-readable, gap-tolerant reference codes shown to users and staff.
 *
 *   await nextCode("JOB")                 → "VSG-JOB-000123"
 *   await nextCode("ASM", { yearly: true }) → "VSG-ASM-2026-000012"
 *
 * Registered prefixes (keep this list in sync with docs/CONVENTIONS.md):
 *   JOB job · APP application · REQ requirement request · TKT support ticket · APR approval
 *   DSR data-subject request · CRT certificate · ASM skill assessment · ENQ enquiry · LEAD lead
 *   OFR offer · PLC placement · INT interview · SUB partner submission · PAY payment · RFD refund
 *   CRS course · BAT batch · DRV campus drive · MOB mobilisation · GRV grievance · STL partner settlement
 *
 * Tax invoices and credit notes do NOT use nextCode — use nextGstDocumentNumber() below.
 */
export async function nextCode(prefix: string, opts: { yearly?: boolean; pad?: number; tx?: DbOrTx } = {}): Promise<string> {
  const year = new Date().getUTCFullYear();
  const key = opts.yearly ? `${prefix}-${year}` : prefix;
  const value = await incrementSequence(key, opts.tx);
  const padded = String(value).padStart(opts.pad ?? 6, "0");
  return opts.yearly ? `VSG-${prefix}-${year}-${padded}` : `VSG-${prefix}-${padded}`;
}

async function incrementSequence(key: string, tx?: DbOrTx): Promise<number> {
  const executor = tx ?? db;
  const result = await executor.execute<{ value: string | number }>(sql`
    insert into code_sequences (key, value, updated_at)
    values (${key}, 1, now())
    on conflict (key) do update set value = code_sequences.value + 1, updated_at = now()
    returning value
  `);
  return Number(result.rows[0]?.value ?? 1);
}

export { financialYearLabel } from "./fiscal";

/**
 * GST-compliant document number for tax invoices and credit notes.
 *
 * CGST Rule 46(b): a consecutive serial number of at most 16 characters (letters, digits,
 * "-" or "/"), unique for the financial year. Separate series per document type:
 *   invoice      → "VSG/2627/000123"   (15 characters)
 *   credit_note  → "VSGC/2627/000045"  (16 characters)
 *
 * Assign the number only when a document is ISSUED (never for drafts) so the legal series has no gaps.
 */
export async function nextGstDocumentNumber(
  kind: "invoice" | "credit_note",
  opts: { date?: Date; tx?: DbOrTx } = {},
): Promise<string> {
  const fy = financialYearLabel(opts.date ?? new Date());
  const series = kind === "invoice" ? "VSG" : "VSGC";
  const value = await incrementSequence(`GST-${series}-${fy}`, opts.tx);
  if (value > 999_999) throw new Error(`GST ${kind} series ${series}/${fy} exhausted`);
  return `${series}/${fy}/${String(value).padStart(6, "0")}`;
}
