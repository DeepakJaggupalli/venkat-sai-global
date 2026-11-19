import { describe, expect, it } from "vitest";

import en from "@/i18n/messages/en/public-marketing.json";
import hi from "@/i18n/messages/hi/public-marketing.json";
import te from "@/i18n/messages/te/public-marketing.json";

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("public-marketing catalogue", () => {
  it("has the same keys and placeholders in every language", () => {
    const enMap = en as Record<string, string>;
    for (const [name, catalogue] of [
      ["hi", hi],
      ["te", te],
    ] as const) {
      const map = catalogue as Record<string, string>;
      expect(Object.keys(map).sort(), name).toEqual(Object.keys(enMap).sort());
      for (const key of Object.keys(enMap)) {
        expect(placeholders(map[key]!), `${name} ${key}`).toEqual(placeholders(enMap[key]!));
        expect(map[key]!.trim().length, `${name} ${key}`).toBeGreaterThan(0);
      }
    }
  });
});
