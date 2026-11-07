import { describe, expect, it } from "vitest";

import en from "@/i18n/messages/en/talent-messages.json";
import hi from "@/i18n/messages/hi/talent-messages.json";
import te from "@/i18n/messages/te/talent-messages.json";

import { DEFAULT_MESSAGES_LABELS, formatLabel, unreadLabel } from "./labels";

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("messages labels", () => {
  it("formats placeholders and leaves unknown ones visible", () => {
    expect(formatLabel("{count} unread", { count: 3 })).toBe("3 unread");
    expect(formatLabel("{a} and {b}", { a: "x" })).toBe("x and {b}");
  });

  it("picks the singular or plural unread label", () => {
    expect(unreadLabel({ unread_one: "{count} message", unread_other: "{count} messages" }, 1)).toBe("1 message");
    expect(unreadLabel({ unread_one: "{count} message", unread_other: "{count} messages" }, 4)).toBe("4 messages");
  });

  it("talent-messages catalogue covers every label in all languages with the same placeholders", () => {
    for (const key of Object.keys(DEFAULT_MESSAGES_LABELS)) {
      expect(en, `en ${key}`).toHaveProperty(key);
    }
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
