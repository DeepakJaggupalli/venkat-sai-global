/**
 * Requirement posters — phone publishing form schema (client-safe). The poster itself is a CMS entry of the
 * collection `requirement_posts` (src/modules/content/collections.ts); this module adds the one-step
 * "upload + create + publish" flow used from phones and the Web Share Target.
 */
import { z } from "zod";

import { f } from "@/lib/validation";

const optionalBlank = <T extends z.ZodType>(schema: T) => z.preprocess((v) => (v === "" || v === null ? undefined : v), schema.optional());

export const MAX_POSTER_TRADES = 30;

export const quickPosterSchema = z.object({
  /** cms_media file uploaded by the signed-in staff member (upload route or share target). */
  fileId: f.uuid(),
  title: f.optionalText(200),
  countryCode: optionalBlank(z.string().trim().length(2, "Choose a country").toUpperCase()),
  companyName: f.optionalText(160),
  /** One trade per line, optionally "Trade - salary" ("Mechanical helper - 900 AED"). */
  trades: f.optionalText(4000),
  /** One benefit per line. */
  benefits: f.optionalText(3000),
  description: f.optionalText(2000),
  applyBy: optionalBlank(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date")),
});
export type QuickPosterInput = z.output<typeof quickPosterSchema>;

export type PosterTradeLine = { trade: string; salary?: string; currency?: string };

/** A trailing upper-case code ("900 AED"); lower-case words such as "day" are not currencies. */
const CURRENCY_AT_END = /\s([A-Z]{3})$/;

/**
 * "Mechanical helper - 900 AED + food 350" → { trade: "Mechanical helper", salary: "900 AED + food 350" }.
 * A trailing 3-letter code ("... 900 AED") is also stored as the currency; currencies are never assumed.
 */
export function parseTradeLines(text: string | undefined | null): PosterTradeLine[] {
  if (!text) return [];
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/^[\s*•-]+/, "").trim())
    .filter(Boolean);
  return lines.slice(0, MAX_POSTER_TRADES).map((line) => {
    const match = /^(.+?)(?:\s+[-–—]\s+|\s*:\s+)(.+)$/.exec(line);
    if (!match) return { trade: line.slice(0, 120) };
    const trade = match[1]!.trim().slice(0, 120);
    const salary = match[2]!.trim().slice(0, 160);
    const currency = CURRENCY_AT_END.exec(salary)?.[1];
    return currency ? { trade, salary, currency } : { trade, salary };
  });
}

export function parseLines(text: string | undefined | null, max: number, maxLength: number): string[] {
  if (!text) return [];
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/^[\s*•-]+/, "").trim().slice(0, maxLength))
    .filter(Boolean)
    .slice(0, max);
}
