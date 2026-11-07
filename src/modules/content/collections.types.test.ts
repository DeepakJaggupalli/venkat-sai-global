/**
 * Type-level checks of the collection registry (run by tsc; the vitest body only asserts runtime basics).
 */
import { describe, expect, expectTypeOf, it } from "vitest";

import type { CaseStudyData, EventData, HomepageData, NavigationData, ServiceData, SiteSettingsData } from "./collections";
import { COLLECTIONS } from "./collections";
import { type DataOf, field } from "./fields";

describe("collection data types", () => {
  it("derives required and optional keys from the field declarations", () => {
    const fields = {
      title: field.text({ label: "Title", required: true }),
      note: field.textarea({ label: "Note" }),
      kind: field.select({ label: "Kind", options: [{ value: "a", label: "A" }, { value: "b", label: "B" }], required: true }),
      tags: field.textlist({ label: "Tags" }),
      refs: field.reference({ label: "Refs", target: { kind: "collection", collection: "services" }, multiple: true }),
      one: field.reference({ label: "One", target: { kind: "collection", collection: "services" } }),
      items: field.list({ label: "Items", itemLabel: "Item", fields: { q: field.text({ label: "Q", required: true }), n: field.number({ label: "N" }) } }),
    };
    type D = DataOf<typeof fields>;
    expectTypeOf<D["title"]>().toEqualTypeOf<string>();
    expectTypeOf<D["kind"]>().toEqualTypeOf<"a" | "b">();
    expectTypeOf<D["note"]>().toEqualTypeOf<string | undefined>();
    expectTypeOf<D["tags"]>().toEqualTypeOf<string[] | undefined>();
    expectTypeOf<D["refs"]>().toEqualTypeOf<string[] | undefined>();
    expectTypeOf<D["one"]>().toEqualTypeOf<string | undefined>();
    expectTypeOf<NonNullable<D["items"]>[number]>().toEqualTypeOf<{ q: string; n?: number }>();
    expect(Object.keys(fields)).toHaveLength(7);
  });

  it("types the registry's collections", () => {
    expectTypeOf<HomepageData["hero"]["heading"]>().toEqualTypeOf<string>();
    expectTypeOf<NonNullable<HomepageData["sections"]>[number]["key"]>().toEqualTypeOf<
      "metrics" | "about" | "services" | "opportunities" | "industries" | "global_reach" | "employers" | "candidates" | "partners" | "institutions" | "success_stories" | "news" | "cta_band"
    >();
    expectTypeOf<ServiceData["overview"]>().toEqualTypeOf<string>();
    expectTypeOf<ServiceData["benefits"]>().toEqualTypeOf<string[] | undefined>();
    expectTypeOf<SiteSettingsData["legalEntity"]["name"]>().toEqualTypeOf<string>();
    expectTypeOf<NonNullable<SiteSettingsData["contact"]>["email"]>().toEqualTypeOf<string | undefined>();
    expectTypeOf<NavigationData["headerItems"][number]["title"]>().toEqualTypeOf<string>();
    expectTypeOf<EventData["startsAt"]>().toEqualTypeOf<string>();
    expectTypeOf<CaseStudyData["outcome"]>().toEqualTypeOf<string>();
    for (const [key, definition] of Object.entries(COLLECTIONS)) expect(definition.key).toBe(key);
  });
});
