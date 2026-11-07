import { describe, expect, it } from "vitest";

import { COLLECTIONS } from "./collections";
import { collectAssetRefs, collectReferences, extractSearchText, sanitizeRichTextFields, stableStringify, stripInternalFields } from "./field-walk";

const strip = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

describe("field walkers", () => {
  it("sanitises rich text at any depth and leaves other fields alone", () => {
    const data = sanitizeRichTextFields(
      COLLECTIONS.destinations.fields,
      { overview: "<p>Hi</p><script>x</script>", guidance: { employmentGuidance: "<b onclick=x>Bold</b>", disclaimer: "<i>plain</i>" } },
      (html) => html.replace(/<script>.*?<\/script>/g, "").replace(/ onclick=\w+/g, ""),
    );
    expect(data.overview).toBe("<p>Hi</p>");
    expect((data.guidance as Record<string, unknown>).employmentGuidance).toBe("<b>Bold</b>");
    // textarea values are rendered escaped, not sanitised as HTML
    expect((data.guidance as Record<string, unknown>).disclaimer).toBe("<i>plain</i>");
  });

  it("extracts searchable text without internal notes, links or ids", () => {
    const text = extractSearchText(
      COLLECTIONS.pages.fields,
      { pageType: "legal", body: "<p>Your <strong>rights</strong></p>", version: "2026-11-01", internalNote: "secret review note" },
      strip,
    );
    expect(text).toContain("Your rights");
    expect(text).toContain("Legal / policy");
    expect(text).not.toContain("secret");
  });

  it("collects media references with their field paths", () => {
    const refs = collectAssetRefs(COLLECTIONS.homepage.fields, {
      hero: { heading: "Hi", mediaAssetId: "11111111-1111-4111-8111-111111111111" },
    });
    expect(refs).toEqual([{ assetId: "11111111-1111-4111-8111-111111111111", field: "data.hero.mediaAssetId" }]);
    const gallery = collectAssetRefs(COLLECTIONS.gallery_albums.fields, { assetIds: ["a", "b"] });
    expect(gallery.map((r) => r.field)).toEqual(["data.assetIds", "data.assetIds"]);
  });

  it("collects entry, taxonomy and country references", () => {
    const refs = collectReferences(COLLECTIONS.destinations.fields, {
      countryCode: "AE",
      hiringIndustryIds: ["i1"],
      languageCodes: ["ar"],
      availableServiceIds: ["s1", "s2"],
    });
    expect([...refs.countries]).toEqual(["AE"]);
    expect([...(refs.taxonomy.get("industries") ?? [])]).toEqual(["i1"]);
    expect([...(refs.taxonomy.get("languages") ?? [])]).toEqual(["ar"]);
    expect([...(refs.entries.get("services") ?? [])]).toEqual(["s1", "s2"]);
  });

  it("strips internal fields recursively", () => {
    expect(stripInternalFields(COLLECTIONS.case_studies.fields, { outcome: "<p>Done</p>", evidenceNote: "In the ops drive" })).toEqual({ outcome: "<p>Done</p>" });
  });

  it("stringifies objects stably", () => {
    expect(stableStringify({ b: 1, a: [1, { d: 2, c: 3 }] })).toBe(stableStringify({ a: [1, { c: 3, d: 2 }], b: 1 }));
  });
});
