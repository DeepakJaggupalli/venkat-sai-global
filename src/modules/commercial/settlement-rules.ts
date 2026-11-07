/**
 * Partner settlement fee rules (client-safe, pure). Fees are paid by Venkat Sai to recruitment partners for
 * successful placements, per the assignment's commission terms (if set) or else the partner agreement's
 * commercial terms. Amounts are minor units of the terms' currency (never converted).
 */
import type { PartnerAgreementCommercialTerms, PartnerCommissionTerms, PlacementStatus, SalaryPeriod } from "@/db/schema";

import { applyBasisPoints } from "./money";
import { addDays } from "./periods";

export type FeeTerms = {
  source: "assignment" | "agreement";
  model: "flat_per_placement" | "flat_per_selection" | "percent_of_fee" | "salary_percentage" | "none" | "custom";
  amountMinor: number | null;
  currency: string | null;
  basisPoints: number | null;
  payableAfterDays: number;
};

/** Normalise assignment terms (preferred when they name a model) and agreement terms into one shape. */
export function resolveFeeTerms(assignment: PartnerCommissionTerms | null | undefined, agreement: PartnerAgreementCommercialTerms | null | undefined): FeeTerms | null {
  if (assignment?.model && assignment.model !== "none") {
    return {
      source: "assignment",
      model: assignment.model === "fixed_per_placement" ? "flat_per_placement" : assignment.model,
      amountMinor: assignment.amountMinor ?? null,
      currency: assignment.currency?.toUpperCase() ?? null,
      basisPoints: assignment.percentBasisPoints ?? null,
      payableAfterDays: Math.max(0, assignment.payableAfterDays ?? 0),
    };
  }
  if (agreement?.feeModel) {
    return {
      source: "agreement",
      model: agreement.feeModel,
      amountMinor: agreement.amountMinor ?? null,
      currency: agreement.currency?.toUpperCase() ?? null,
      basisPoints: agreement.rateBasisPoints ?? null,
      payableAfterDays: Math.max(0, agreement.payableAfterJoiningDays ?? 0),
    };
  }
  if (assignment?.model === "none") return { source: "assignment", model: "none", amountMinor: null, currency: null, basisPoints: null, payableAfterDays: 0 };
  return null;
}

export type PlacementForFee = {
  id: string;
  code: string;
  status: PlacementStatus;
  placedOn: string;
  joinedOn: string | null;
  salaryMinor: number | null;
  salaryCurrency: string | null;
  salaryPeriod: SalaryPeriod | null;
  feeMinor: number | null;
  feeCurrency: string | null;
};

export type FeeDecision =
  | { ok: true; amountMinor: number; currency: string; description: string; payableOn: string }
  | { ok: false; reason: string; payableOn?: string };

const ANNUAL_FACTOR: Partial<Record<SalaryPeriod, number>> = { year: 1, month: 12, week: 52 };

function dateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

/**
 * Fee for one placement under the terms, if payable on or before `periodEnd` (YYYY-MM-DD).
 *  - flat_per_selection: payable from the placement date (cancelled placements excluded);
 *  - other models: payable `payableAfterDays` after joining (joined / completed placements only);
 *  - percent_of_fee: % of the placement fee Venkat Sai charges (placement fee currency);
 *  - salary_percentage: % of the annualised salary (year ×1, month ×12, week ×52; other periods are manual);
 *  - none: no fee; custom: added manually by staff.
 */
export function computePlacementFee(placement: PlacementForFee, terms: FeeTerms | null, periodEnd: string): FeeDecision {
  if (!terms) return { ok: false, reason: "No commission terms on the assignment or partner agreement." };
  if (terms.model === "none") return { ok: false, reason: "The terms say no fee is payable." };
  if (terms.model === "custom") return { ok: false, reason: "Custom terms: add the amount manually." };
  if (placement.status === "cancelled" || placement.status === "replacement_required") return { ok: false, reason: `The placement is ${placement.status.replace("_", " ")}.` };

  let payableOn: Date;
  if (terms.model === "flat_per_selection") {
    payableOn = dateOnly(placement.placedOn);
  } else {
    if (!placement.joinedOn || (placement.status !== "joined" && placement.status !== "completed")) return { ok: false, reason: "The candidate has not joined yet." };
    payableOn = addDays(dateOnly(placement.joinedOn), terms.payableAfterDays);
  }
  const payableIso = payableOn.toISOString().slice(0, 10);
  if (payableIso > periodEnd) return { ok: false, reason: `Payable from ${payableIso}.`, payableOn: payableIso };

  switch (terms.model) {
    case "flat_per_placement":
    case "flat_per_selection": {
      if (!terms.amountMinor || terms.amountMinor <= 0 || !terms.currency) return { ok: false, reason: "The terms have no fee amount and currency." };
      return { ok: true, amountMinor: terms.amountMinor, currency: terms.currency, description: `${terms.model === "flat_per_selection" ? "Selection" : "Placement"} fee — ${placement.code}`, payableOn: payableIso };
    }
    case "percent_of_fee": {
      if (!terms.basisPoints || terms.basisPoints <= 0) return { ok: false, reason: "The terms have no percentage." };
      if (!placement.feeMinor || placement.feeMinor <= 0 || !placement.feeCurrency) return { ok: false, reason: "The placement has no fee recorded to take a percentage of." };
      const amountMinor = applyBasisPoints(placement.feeMinor, terms.basisPoints);
      if (amountMinor <= 0) return { ok: false, reason: "The computed fee is zero." };
      return { ok: true, amountMinor, currency: placement.feeCurrency, description: `${(terms.basisPoints / 100).toString()}% of placement fee — ${placement.code}`, payableOn: payableIso };
    }
    case "salary_percentage": {
      if (!terms.basisPoints || terms.basisPoints <= 0) return { ok: false, reason: "The terms have no percentage." };
      if (!placement.salaryMinor || !placement.salaryCurrency || !placement.salaryPeriod) return { ok: false, reason: "The placement has no salary recorded." };
      const factor = ANNUAL_FACTOR[placement.salaryPeriod];
      if (!factor) return { ok: false, reason: `A ${placement.salaryPeriod} salary cannot be annualised: add the amount manually.` };
      const amountMinor = applyBasisPoints(placement.salaryMinor * factor, terms.basisPoints);
      if (amountMinor <= 0) return { ok: false, reason: "The computed fee is zero." };
      return { ok: true, amountMinor, currency: placement.salaryCurrency, description: `${(terms.basisPoints / 100).toString()}% of annual salary — ${placement.code}`, payableOn: payableIso };
    }
    default:
      return { ok: false, reason: "Unsupported terms." };
  }
}

/** Settlement total: fees, bonuses and adjustments add; deductions subtract (voided lines ignored). */
export function settlementTotal(lines: readonly { kind: string; amountMinor: number; voidedAt?: Date | null }[]): number {
  return lines.filter((l) => !l.voidedAt).reduce((acc, l) => acc + (l.kind === "deduction" ? -l.amountMinor : l.amountMinor), 0);
}
