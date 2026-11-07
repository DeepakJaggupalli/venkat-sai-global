import "server-only";

import { languages as isoLanguages, type TLanguageCode } from "countries-list";
import { sql } from "drizzle-orm";

import { db } from "@/db";
import { languages } from "@/db/schema";

import { assertUnique, countInserted, type SeedResult } from "./util";

/**
 * Languages offered in candidate profiles (ISO 639-1 codes). English, Hindi and Telugu are the
 * UI locales of the People Portal (isUiLocale). Order = selector order: UI locales, other Indian
 * languages, then languages common in overseas workplaces.
 */
const CODES: readonly TLanguageCode[] = [
  "en", "hi", "te",
  "ta", "kn", "ml", "mr", "bn", "gu", "pa", "or", "ur", "as", "ne", "si",
  "ar", "fr", "de", "es", "pt", "ru", "ja", "zh", "ko", "it", "nl", "pl", "ro", "tl", "ms", "id", "th", "vi", "tr",
];

const UI_LOCALES = new Set(["en", "hi", "te"]);

/** Clearer current English names / single native names where the package lists alternatives. */
const NAME_OVERRIDES: Partial<Record<TLanguageCode, { name?: string; nativeName?: string }>> = {
  pa: { name: "Punjabi", nativeName: "ਪੰਜਾਬੀ" },
  or: { name: "Odia" },
  si: { name: "Sinhala" },
  tl: { name: "Filipino (Tagalog)", nativeName: "Filipino" },
  th: { nativeName: "ไทย" },
};

export function languageSeedData() {
  assertUnique(CODES, (c) => c, "language code");
  return CODES.map((code, index) => {
    const base = isoLanguages[code];
    if (!base) throw new Error(`Unknown language code in seed data: ${code}`);
    const override = NAME_OVERRIDES[code] ?? {};
    return {
      code,
      name: override.name ?? base.name,
      nativeName: override.nativeName ?? base.native,
      isActive: true,
      isUiLocale: UI_LOCALES.has(code),
      sortOrder: (index + 1) * 10,
    };
  });
}

export async function seedLanguages(): Promise<SeedResult> {
  const data = languageSeedData();
  const rows = await db
    .insert(languages)
    .values(data)
    .onConflictDoUpdate({
      target: languages.code,
      set: { nativeName: sql`excluded.native_name` },
      setWhere: sql`${languages.nativeName} is null`,
    })
    .returning({ inserted: sql<boolean>`(xmax = 0)` });
  return { name: "languages", ...countInserted(rows), total: data.length };
}
