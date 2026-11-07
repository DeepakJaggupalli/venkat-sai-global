/**
 * Credit-lot simulation over the append-only credit ledger (client-safe, pure).
 *
 * The ledger stores one running balance per (organisation, entitlement key). To expire the unused part of a
 * grant exactly, the ledger is replayed as "lots":
 *  - every positive entry (plan grant, purchase, positive adjustment / refund) opens a lot;
 *  - consumption and negative adjustments draw from live lots, earliest expiry first (lots without an expiry
 *    last), oldest first on ties — the order most favourable to the customer;
 *  - an `expiry` entry closes the lot it references (referenceType "credit_lot", referenceId = lot entry id);
 *  - usage beyond the available lots (possible only while limits are not enforced, or under an unlimited
 *    feature) becomes debt, which the next positive entry pays off first. Grants write an `adjustment`
 *    before adding credits so unenforced usage never eats new credits (see credits.ts).
 */
import type { CreditLedgerReason } from "@/db/schema/commercial";

export const LOT_REFERENCE_TYPE = "credit_lot";

export type LedgerEntry = {
  id: string;
  seq: number;
  delta: number;
  reason: CreditLedgerReason;
  expiresAt: Date | null;
  referenceType: string | null;
  referenceId: string | null;
};

export type CreditLot = {
  id: string;
  seq: number;
  reason: CreditLedgerReason;
  granted: number;
  remaining: number;
  expiresAt: Date | null;
  referenceType: string | null;
  referenceId: string | null;
  /** An expiry entry has closed this lot. */
  closed: boolean;
};

export type LotState = { lots: CreditLot[]; debt: number; balance: number };

function drawOrder(a: CreditLot, b: CreditLot): number {
  const ae = a.expiresAt?.getTime() ?? Number.POSITIVE_INFINITY;
  const be = b.expiresAt?.getTime() ?? Number.POSITIVE_INFINITY;
  return ae === be ? a.seq - b.seq : ae - be;
}

export function simulateLots(entries: readonly LedgerEntry[]): LotState {
  const ordered = [...entries].sort((a, b) => a.seq - b.seq);
  const lots: CreditLot[] = [];
  const byId = new Map<string, CreditLot>();
  let debt = 0;

  for (const entry of ordered) {
    if (entry.delta > 0) {
      let remaining = entry.delta;
      if (debt > 0) {
        const paid = Math.min(debt, remaining);
        debt -= paid;
        remaining -= paid;
      }
      const lot: CreditLot = {
        id: entry.id,
        seq: entry.seq,
        reason: entry.reason,
        granted: entry.delta,
        remaining,
        expiresAt: entry.expiresAt,
        referenceType: entry.referenceType,
        referenceId: entry.referenceId,
        closed: false,
      };
      lots.push(lot);
      byId.set(lot.id, lot);
      continue;
    }

    let amount = -entry.delta;
    if (entry.reason === "expiry" && entry.referenceType === LOT_REFERENCE_TYPE && entry.referenceId) {
      const lot = byId.get(entry.referenceId);
      if (lot) {
        const taken = Math.min(lot.remaining, amount);
        lot.remaining -= taken;
        lot.closed = true;
        amount -= taken;
      }
    }
    if (amount <= 0) continue;
    const live = lots.filter((l) => !l.closed && l.remaining > 0).sort(drawOrder);
    for (const lot of live) {
      if (amount <= 0) break;
      const taken = Math.min(lot.remaining, amount);
      lot.remaining -= taken;
      amount -= taken;
    }
    debt += amount;
  }

  const balance = lots.reduce((acc, l) => acc + l.remaining, 0) - debt;
  return { lots, debt, balance };
}

/** Lots whose expiry time has passed and that still hold unused credits. */
export function dueLots(state: LotState, now: Date): CreditLot[] {
  return state.lots.filter((l) => !l.closed && l.remaining > 0 && l.expiresAt !== null && l.expiresAt.getTime() <= now.getTime());
}

/** Open lots granted by one subscription (closed when the subscription ends). */
export function subscriptionLots(state: LotState, subscriptionId: string): CreditLot[] {
  return state.lots.filter((l) => !l.closed && l.remaining > 0 && l.referenceType === "subscription" && l.referenceId === subscriptionId);
}
