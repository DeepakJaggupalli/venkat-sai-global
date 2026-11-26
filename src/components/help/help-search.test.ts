import { describe, expect, it } from "vitest";

import { matchesHelpQuery, normalizeHelpQuery } from "./help-search";

describe("help page filter", () => {
  it("splits the query into lower-case words, ignoring punctuation and accents", () => {
    expect(normalizeHelpQuery("  Invoice, PAY! ")).toEqual(["invoice", "pay"]);
    expect(normalizeHelpQuery("Résumé")).toEqual(["resume"]);
    expect(normalizeHelpQuery("")).toEqual([]);
    expect(normalizeHelpQuery("a b c d e f g h i j")).toHaveLength(8);
    expect(normalizeHelpQuery("x".repeat(200))[0]).toHaveLength(40);
  });

  it("matches only when every word appears somewhere in the topic", () => {
    const texts = ["Money", "Record payments against an invoice"];
    expect(matchesHelpQuery([], texts)).toBe(true);
    expect(matchesHelpQuery(normalizeHelpQuery("invoice pay"), texts)).toBe(true);
    expect(matchesHelpQuery(normalizeHelpQuery("INVOICE"), texts)).toBe(true);
    expect(matchesHelpQuery(normalizeHelpQuery("invoice visa"), texts)).toBe(false);
  });

  it("treats regex characters as plain text", () => {
    expect(matchesHelpQuery(normalizeHelpQuery(".*"), ["anything"])).toBe(true); // punctuation only → no terms
    expect(matchesHelpQuery(normalizeHelpQuery("(visa)"), ["Visa and medical"])).toBe(true);
  });
});
