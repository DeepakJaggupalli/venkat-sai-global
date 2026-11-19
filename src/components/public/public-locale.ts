import { Noto_Sans_Arabic, Noto_Sans_Oriya } from "next/font/google";

import { localeDir, type PublicLocale } from "@/i18n/config";
import { cn } from "@/lib/utils";

/**
 * Script fonts for the public-only languages. `preload: false` and the browser only fetches a face when text in that
 * script is on screen, so English / Hindi / Telugu pages pay nothing. `.locale-script` (globals.css) slots the font in
 * after Inter / Figtree, which have no Odia or Arabic glyphs, so Latin text (brand names, numbers) keeps the house fonts.
 */
const odia = Noto_Sans_Oriya({ subsets: ["oriya"], display: "swap", preload: false, variable: "--font-script" });
const arabic = Noto_Sans_Arabic({ subsets: ["arabic"], display: "swap", preload: false, variable: "--font-script" });

/** Attributes for a translated page's content wrapper: language, direction (Arabic is RTL) and the script font. */
export function publicLocaleProps(locale: PublicLocale): { lang: PublicLocale; dir: "ltr" | "rtl"; className?: string } {
  const font = locale === "or" ? odia : locale === "ar" ? arabic : null;
  return { lang: locale, dir: localeDir(locale), className: font ? cn(font.variable, "locale-script") : undefined };
}
