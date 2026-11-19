import { describe, expect, it } from "vitest";

import { isLocale, isPublicLocale, localeDir, PUBLIC_LOCALES } from "@/i18n/config";
import { MESSAGES, publicMessages } from "@/i18n/messages";
import ar from "@/i18n/messages/ar/public-marketing.json";
import arSafety from "@/i18n/messages/ar/public-safety.json";
import en from "@/i18n/messages/en/public-marketing.json";
import enSafety from "@/i18n/messages/en/public-safety.json";
import hi from "@/i18n/messages/hi/public-marketing.json";
import hiSafety from "@/i18n/messages/hi/public-safety.json";
import or from "@/i18n/messages/or/public-marketing.json";
import orSafety from "@/i18n/messages/or/public-safety.json";
import te from "@/i18n/messages/te/public-marketing.json";
import teSafety from "@/i18n/messages/te/public-safety.json";

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

function expectParity(enMap: Record<string, string>, catalogues: readonly (readonly [string, Record<string, string>])[]) {
  for (const [name, map] of catalogues) {
    expect(Object.keys(map).sort(), name).toEqual(Object.keys(enMap).sort());
    for (const key of Object.keys(enMap)) {
      expect(placeholders(map[key]!), `${name} ${key}`).toEqual(placeholders(enMap[key]!));
      expect(map[key]!.trim().length, `${name} ${key}`).toBeGreaterThan(0);
    }
  }
}

describe("public-marketing catalogue", () => {
  it("has the same keys and placeholders in every language", () => {
    expectParity(en, [
      ["hi", hi],
      ["te", te],
      ["or", or],
      ["ar", ar],
    ]);
  });
});

describe("public-safety catalogue", () => {
  it("has the same keys and placeholders in every language", () => {
    expectParity(enSafety, [
      ["hi", hiSafety],
      ["te", teSafety],
      ["or", orSafety],
      ["ar", arSafety],
    ]);
  });
});

describe("public-only languages", () => {
  it("are valid for the public pages but not for the portal", () => {
    expect(PUBLIC_LOCALES).toEqual(["en", "hi", "te", "or", "ar"]);
    for (const code of ["or", "ar"]) {
      expect(isPublicLocale(code), code).toBe(true);
      expect(isLocale(code), code).toBe(false);
      expect(code in MESSAGES, code).toBe(false);
    }
    expect(localeDir("ar")).toBe("rtl");
    expect(localeDir("or")).toBe("ltr");
    expect(publicMessages("ar", "public-safety")["hero.report"]).toBe(arSafety["hero.report"]);
    expect(publicMessages("hi", "public-marketing")).toBe(MESSAGES.hi["public-marketing"]);
  });
});
