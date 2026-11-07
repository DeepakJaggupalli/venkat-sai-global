import { describe, expect, it } from "vitest";

import {
  calendarDate,
  decodeEntities,
  excerptText,
  headingId,
  normaliseQuery,
  pageParam,
  pickParam,
  plainText,
  readingMinutes,
  safeTimeZone,
  splitSnippet,
  telHref,
  whatsappHref,
  withHeadingAnchors,
  wordCount,
} from "./text";

describe("plainText", () => {
  it("strips tags, decodes entities and collapses whitespace", () => {
    expect(plainText("<p>Fish &amp; chips</p><p>are&nbsp;good</p>")).toBe("Fish & chips are good");
    expect(plainText("<ul><li>One</li><li>Two</li></ul>")).toBe("One Two");
    expect(plainText(null)).toBe("");
  });

  it("decodes numeric entities", () => {
    expect(decodeEntities("&#8377; &#x20B9; &#39;")).toBe("₹ ₹ '");
    expect(decodeEntities("&unknown;")).toBe("&unknown;");
  });
});

describe("reading time", () => {
  it("counts words across fragments", () => {
    expect(wordCount("<p>one two</p>", "three")).toBe(3);
    expect(wordCount("<p> — </p>")).toBe(0);
  });

  it("is at least a minute and rounds up", () => {
    expect(readingMinutes("")).toBe(1);
    const words = Array.from({ length: 401 }, () => "word").join(" ");
    expect(readingMinutes(`<p>${words}</p>`)).toBe(3);
  });
});

describe("excerptText", () => {
  it("keeps short text and cuts long text on a word boundary", () => {
    expect(excerptText("<p>Short</p>", 20)).toBe("Short");
    expect(excerptText("<p>alpha beta gamma delta epsilon</p>", 20)).toBe("alpha beta gamma…");
  });
});

describe("headings", () => {
  it("creates unique ASCII ids", () => {
    const used = new Set<string>();
    expect(headingId("Your rights", used)).toBe("your-rights");
    expect(headingId("Your rights", used)).toBe("your-rights-2");
    expect(headingId("डेटा", used)).toBe("section");
    expect(headingId("Café policy", used)).toBe("cafe-policy");
  });

  it("anchors h2 and h3 and lists them in order", () => {
    const { html, headings } = withHeadingAnchors("<h2>Who we are</h2><p>x</p><h3>Contact &amp; help</h3><h4>Skip</h4>");
    expect(html).toBe('<h2 id="who-we-are">Who we are</h2><p>x</p><h3 id="contact-help">Contact &amp; help</h3><h4>Skip</h4>');
    expect(headings).toEqual([
      { id: "who-we-are", text: "Who we are", level: 2 },
      { id: "contact-help", text: "Contact & help", level: 3 },
    ]);
  });

  it("ignores empty headings and handles missing html", () => {
    expect(withHeadingAnchors("<h2> </h2>").headings).toEqual([]);
    expect(withHeadingAnchors(null)).toEqual({ html: "", headings: [] });
  });
});

describe("splitSnippet", () => {
  it("marks the matches", () => {
    expect(splitSnippet("Find «welding» jobs in «Qatar»")).toEqual([
      { text: "Find ", match: false },
      { text: "welding", match: true },
      { text: " jobs in ", match: false },
      { text: "Qatar", match: true },
    ]);
  });

  it("drops stray markers and handles empty input", () => {
    expect(splitSnippet("broken «marker")).toEqual([{ text: "broken marker", match: false }]);
    expect(splitSnippet(null)).toEqual([]);
  });
});

describe("params", () => {
  it("parses pages defensively", () => {
    expect(pageParam("3")).toBe(3);
    expect(pageParam(["2", "5"])).toBe(2);
    expect(pageParam("-1")).toBe(1);
    expect(pageParam("abc")).toBe(1);
    expect(pageParam("99999")).toBe(500);
  });

  it("accepts only whitelisted values", () => {
    expect(pickParam("news", ["news", "blog"] as const)).toBe("news");
    expect(pickParam("other", ["news"] as const)).toBeUndefined();
    expect(pickParam(undefined, ["news"] as const)).toBeUndefined();
  });

  it("normalises queries", () => {
    expect(normaliseQuery("  welder   jobs ")).toBe("welder jobs");
    expect(normaliseQuery("x".repeat(150))).toHaveLength(100);
  });
});

describe("dates and zones", () => {
  it("parses calendar dates", () => {
    expect(calendarDate("2026-11-01")?.toISOString()).toBe("2026-11-01T00:00:00.000Z");
    expect(calendarDate("01/11/2026")).toBeNull();
  });

  it("falls back for invalid time zones", () => {
    expect(safeTimeZone("Asia/Dubai", "Asia/Kolkata")).toBe("Asia/Dubai");
    expect(safeTimeZone("Mars/Base", "Asia/Kolkata")).toBe("Asia/Kolkata");
    expect(safeTimeZone("", "Asia/Kolkata")).toBe("Asia/Kolkata");
  });
});

describe("contact links", () => {
  it("builds tel and WhatsApp links", () => {
    expect(telHref("+91 98765 43210")).toBe("tel:+919876543210");
    expect(telHref("0891-2345678")).toBe("tel:08912345678");
    expect(whatsappHref("+91 98765 43210")).toBe("https://wa.me/919876543210");
    expect(whatsappHref("123")).toBeNull();
  });
});
