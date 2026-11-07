import { HOMEPAGE_SECTION_OPTIONS, type HomepageSectionKey } from "@/modules/content/collections";

/**
 * Homepage section order and visibility from the CMS homepage singleton (pure, client-safe).
 *
 * - Sections listed in the CMS appear in that order; `visible: false` hides them.
 * - Sections the CMS does not mention are appended in the default (specification) order, so a section added
 *   to the product later still shows up until an editor decides otherwise.
 * - Unknown keys and duplicates are ignored (the editor already rejects duplicates on publish).
 */

export type HomepageSectionInput = { key?: string | null; visible?: boolean | null; heading?: string | null; intro?: string | null };

export type ResolvedSection = { key: HomepageSectionKey; heading: string | null; intro: string | null };

const DEFAULT_ORDER: readonly HomepageSectionKey[] = HOMEPAGE_SECTION_OPTIONS.map((o) => o.value);

function isSectionKey(value: unknown): value is HomepageSectionKey {
  return typeof value === "string" && (DEFAULT_ORDER as readonly string[]).includes(value);
}

export function resolveHomepageSections(sections: readonly HomepageSectionInput[] | null | undefined): ResolvedSection[] {
  const seen = new Set<HomepageSectionKey>();
  const out: ResolvedSection[] = [];
  for (const section of sections ?? []) {
    if (!section || !isSectionKey(section.key) || seen.has(section.key)) continue;
    seen.add(section.key);
    if (section.visible === false) continue;
    out.push({ key: section.key, heading: section.heading?.trim() || null, intro: section.intro?.trim() || null });
  }
  for (const key of DEFAULT_ORDER) {
    if (!seen.has(key)) out.push({ key, heading: null, intro: null });
  }
  return out;
}
