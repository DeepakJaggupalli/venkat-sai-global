import "server-only";

import { sql } from "drizzle-orm";

import { db, type DbOrTx } from "@/db";

/**
 * Human-readable, gap-tolerant reference codes shown to users and staff.
 *
 *   await nextCode("JOB")                 → "VSG-JOB-000123"
 *   await nextCode("INV", { yearly: true }) → "VSG-INV-2026-000012"
 *
 * Registered prefixes (keep this list in sync with docs/CONVENTIONS.md):
 *   JOB job · APP application · REQ requirement request · TKT support ticket · INV invoice (yearly)
 *   APR approval · DSR data-subject request · CRT certificate · ASM skill assessment · ENQ enquiry
 *   LEAD lead · OFR offer · PLC placement · INT interview · SUB partner submission · PAY payment
 *   RFD refund · CRS course · BAT batch · DRV campus drive · MOB mobilisation · GRV grievance
 */
export async function nextCode(prefix: string, opts: { yearly?: boolean; pad?: number; tx?: DbOrTx } = {}): Promise<string> {
  const year = new Date().getUTCFullYear();
  const key = opts.yearly ? `${prefix}-${year}` : prefix;
  const executor = opts.tx ?? db;
  const result = await executor.execute<{ value: string | number }>(sql`
    insert into code_sequences (key, value, updated_at)
    values (${key}, 1, now())
    on conflict (key) do update set value = code_sequences.value + 1, updated_at = now()
    returning value
  `);
  const value = Number(result.rows[0]?.value ?? 1);
  const padded = String(value).padStart(opts.pad ?? 6, "0");
  return opts.yearly ? `VSG-${prefix}-${year}-${padded}` : `VSG-${prefix}-${padded}`;
}
