/**
 * Tax engine (client-safe, pure). Decides the tax treatment of an invoice and the tax components of each line
 * from configurable `tax_rates` rows — no rate is hardcoded here.
 *
 * Rules (README → Tax engine):
 *  1. A treatment chosen by staff on the invoice (export, sez, exempt, reverse_charge, out_of_scope) wins and
 *     charges no tax; "standard" forces the computation below.
 *  2. A buyer marked tax-exempt in its billing profile → `exempt`, no tax.
 *  3. A seller in India without a GSTIN is not GST-registered and must not collect GST → `out_of_scope`.
 *  4. Seller and buyer in India (GST): same GST state code → CGST + SGST (intra-state), different state →
 *     IGST (inter-state). The buyer's state code is required (place of supply).
 *  5. Buyer outside the seller's country:
 *     a. active rates configured for the buyer's country (VAT / sales tax, optionally per region) → applied;
 *     b. otherwise, when export zero-rating is on (default) → `export` (zero-rated export of services);
 *     c. otherwise IGST is charged with place of supply "96" (foreign country).
 *  6. Seller outside India: rates configured for the buyer's country apply; none → `out_of_scope`.
 * Rates are matched by country, optional region (state code), kind, HSN / SAC code (a rate with the line's code
 * beats a rate without a code) and effective dates (the latest effective rate wins).
 */
import type { InvoiceLineTax, InvoiceTaxTreatment, TaxRateKind } from "@/db/schema/commercial";

import { GST_FOREIGN_PLACE_OF_SUPPLY } from "./constants";
import { applyBasisPoints } from "./money";

export type TaxRateRecord = {
  id: string;
  name: string;
  countryCode: string;
  region: string | null;
  kind: TaxRateKind;
  rateBasisPoints: number;
  taxCode: string | null;
  isActive: boolean;
  effectiveFrom: Date;
  effectiveUntil: Date | null;
};

export type TaxSeller = {
  countryCode: string;
  /** India: GST state code of the seller's registration. */
  stateCode: string | null;
  /** GSTIN / VAT number; without it an Indian seller is not GST-registered. */
  taxId: string | null;
};

export type TaxBuyer = {
  countryCode: string | null;
  stateCode: string | null;
  taxExempt: boolean;
};

export type TaxContext = {
  seller: TaxSeller;
  buyer: TaxBuyer;
  rates: readonly TaxRateRecord[];
  /** Tax point (invoice date) used to pick effective rates. */
  at: Date;
  exportZeroRated: boolean;
  /** Treatment chosen by staff on a manual invoice (null = automatic). */
  treatmentOverride?: InvoiceTaxTreatment | null;
};

export type TaxSupply = "intra_state" | "inter_state" | "export" | "foreign" | "none";

export type TaxDetermination = {
  treatment: InvoiceTaxTreatment;
  supply: TaxSupply;
  /** Rate kinds to apply to each line (empty = no tax). */
  kinds: TaxRateKind[];
  /** Country whose rates apply. */
  rateCountry: string | null;
  /** Region (state code) used to match regional rates. */
  rateRegion: string | null;
  /** India: buyer state code, "96" for a foreign buyer charged IGST; elsewhere the buyer country code. */
  placeOfSupply: string | null;
  /** Explanation printed on zero-tax invoices ("Export of services under LUT…"); null when taxed. */
  note: string | null;
  /** Problems that must be fixed before the invoice can be issued. */
  problems: string[];
};

const INDIA = "IN";

const ZERO_NOTES: Partial<Record<InvoiceTaxTreatment, string>> = {
  export: "Export of services — zero-rated supply.",
  sez: "Supply to an SEZ unit — zero-rated supply.",
  exempt: "Exempt supply — no tax charged.",
  reverse_charge: "Tax payable by the recipient under reverse charge.",
  out_of_scope: "No tax charged.",
};

function zero(treatment: InvoiceTaxTreatment, placeOfSupply: string | null, note?: string | null, problems: string[] = []): TaxDetermination {
  return { treatment, supply: treatment === "export" ? "export" : "none", kinds: [], rateCountry: null, rateRegion: null, placeOfSupply, note: note ?? ZERO_NOTES[treatment] ?? null, problems };
}

function isEffective(rate: TaxRateRecord, at: Date): boolean {
  return rate.isActive && rate.effectiveFrom.getTime() <= at.getTime() && (!rate.effectiveUntil || rate.effectiveUntil.getTime() > at.getTime());
}

function hasRatesFor(rates: readonly TaxRateRecord[], country: string, at: Date, kinds: readonly TaxRateKind[]): boolean {
  return rates.some((r) => r.countryCode === country && kinds.includes(r.kind) && isEffective(r, at));
}

const FOREIGN_KINDS: readonly TaxRateKind[] = ["vat", "sales_tax"];

/** Decide how an invoice is taxed (see the rules at the top of this file). */
export function determineTaxTreatment(ctx: TaxContext): TaxDetermination {
  const { seller, buyer } = ctx;
  const buyerCountry = buyer.countryCode?.toUpperCase() ?? null;
  const override = ctx.treatmentOverride ?? null;
  const defaultPlace = buyerCountry === INDIA ? (buyer.stateCode ?? null) : buyerCountry;

  if (override && override !== "standard") return zero(override, defaultPlace);
  if (!buyerCountry) return zero("out_of_scope", null, null, ["The buyer's billing country is missing. Complete the billing profile before issuing."]);
  if (!override && buyer.taxExempt) return zero("exempt", defaultPlace);

  if (seller.countryCode === INDIA) {
    if (!seller.taxId?.trim()) {
      return zero("out_of_scope", defaultPlace, "Supplier not registered under GST — no GST charged.");
    }
    if (buyerCountry === INDIA) {
      if (!buyer.stateCode) {
        return { ...zero("standard", null, null), note: null, problems: ["The buyer's GST state code (place of supply) is missing. Add it to the billing profile."] };
      }
      const intra = Boolean(seller.stateCode) && seller.stateCode === buyer.stateCode;
      return {
        treatment: "standard",
        supply: intra ? "intra_state" : "inter_state",
        kinds: intra ? ["gst_cgst", "gst_sgst"] : ["gst_igst"],
        rateCountry: INDIA,
        rateRegion: null,
        placeOfSupply: buyer.stateCode,
        note: null,
        problems: seller.stateCode ? [] : ["The seller's GST state code is missing. Set it in Settings → Commercial → Seller details."],
      };
    }
    // Buyer outside India.
    if (!override && hasRatesFor(ctx.rates, buyerCountry, ctx.at, FOREIGN_KINDS)) {
      return { treatment: "standard", supply: "foreign", kinds: [...FOREIGN_KINDS], rateCountry: buyerCountry, rateRegion: buyer.stateCode, placeOfSupply: buyerCountry, note: null, problems: [] };
    }
    if (!override && ctx.exportZeroRated) return zero("export", buyerCountry);
    return {
      treatment: "standard",
      supply: "inter_state",
      kinds: ["gst_igst"],
      rateCountry: INDIA,
      rateRegion: null,
      placeOfSupply: GST_FOREIGN_PLACE_OF_SUPPLY,
      note: null,
      problems: [],
    };
  }

  // Seller outside India: apply what is configured for the buyer's country.
  if (hasRatesFor(ctx.rates, buyerCountry, ctx.at, FOREIGN_KINDS)) {
    return { treatment: "standard", supply: "foreign", kinds: [...FOREIGN_KINDS], rateCountry: buyerCountry, rateRegion: buyer.stateCode, placeOfSupply: buyerCountry, note: null, problems: [] };
  }
  return zero(override === "standard" ? "standard" : "out_of_scope", buyerCountry);
}

/** Specificity score of a rate for a line: tax-code match beats region match beats recency. */
function specificity(rate: TaxRateRecord, taxCode: string | null, region: string | null): number {
  let score = 0;
  if (rate.taxCode && taxCode && rate.taxCode === taxCode) score += 2;
  if (rate.region && region && rate.region === region) score += 1;
  return score;
}

export type SelectedRates = { components: TaxRateRecord[]; missing: TaxRateKind[] };

/**
 * Rate components for one line. For each wanted kind, the most specific effective rate wins
 * (exact HSN/SAC code > generic, exact region > whole country, latest effectiveFrom).
 * Foreign supplies use whichever of VAT / sales tax is configured (not both are required).
 */
export function selectRates(ctx: Pick<TaxContext, "rates" | "at">, determination: TaxDetermination, taxCode: string | null): SelectedRates {
  if (!determination.kinds.length || !determination.rateCountry) return { components: [], missing: [] };
  const code = taxCode?.trim() || null;
  const region = determination.rateRegion;
  const candidates = ctx.rates.filter(
    (r) =>
      r.countryCode === determination.rateCountry &&
      determination.kinds.includes(r.kind) &&
      isEffective(r, ctx.at) &&
      (r.taxCode === null || r.taxCode === code) &&
      (r.region === null || r.region === region),
  );
  const components: TaxRateRecord[] = [];
  const missing: TaxRateKind[] = [];
  for (const kind of determination.kinds) {
    const best = candidates
      .filter((r) => r.kind === kind)
      .sort((a, b) => specificity(b, code, region) - specificity(a, code, region) || b.effectiveFrom.getTime() - a.effectiveFrom.getTime())[0];
    if (best) components.push(best);
    else missing.push(kind);
  }
  if (determination.supply === "foreign") {
    // VAT or sales tax: one configured kind is enough.
    return { components, missing: components.length ? [] : missing };
  }
  return { components, missing };
}

/** Tax components of a pre-tax line amount: each component rounded half away from zero at the minor unit. */
export function computeLineTaxes(amountMinor: number, components: readonly TaxRateRecord[]): InvoiceLineTax[] {
  return components.map((rate) => ({
    kind: rate.kind,
    name: rate.name,
    rateBasisPoints: rate.rateBasisPoints,
    amountMinor: applyBasisPoints(amountMinor, rate.rateBasisPoints),
    taxRateId: rate.id,
  }));
}

export const TAX_KIND_LABELS: Record<TaxRateKind, string> = {
  gst_cgst: "CGST",
  gst_sgst: "SGST",
  gst_igst: "IGST",
  vat: "VAT",
  sales_tax: "Sales tax",
  none: "No tax",
};

/** "18%" / "9%" / "12.5%" from basis points. */
export function formatRate(basisPoints: number): string {
  const value = basisPoints / 100;
  return `${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(2).replace(/0+$/, "")}%`;
}

/** Tax breakdown of an invoice: totals per component (kind + rate), in line order of first appearance. */
export function summarizeTaxes(lines: readonly { taxes: readonly InvoiceLineTax[]; amountMinor: number }[]): {
  kind: TaxRateKind;
  name: string;
  rateBasisPoints: number;
  taxableMinor: number;
  amountMinor: number;
}[] {
  const map = new Map<string, { kind: TaxRateKind; name: string; rateBasisPoints: number; taxableMinor: number; amountMinor: number }>();
  for (const line of lines) {
    for (const tax of line.taxes) {
      const key = `${tax.kind}:${tax.rateBasisPoints}`;
      const entry = map.get(key) ?? { kind: tax.kind, name: tax.name, rateBasisPoints: tax.rateBasisPoints, taxableMinor: 0, amountMinor: 0 };
      entry.taxableMinor += line.amountMinor;
      entry.amountMinor += tax.amountMinor;
      map.set(key, entry);
    }
  }
  return [...map.values()];
}
