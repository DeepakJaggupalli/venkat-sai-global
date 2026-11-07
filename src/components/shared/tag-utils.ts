/**
 * Pure tag-list helpers for TagInput (client-safe, unit-tested).
 */
export type AddTagsResult = { tags: string[]; added: string[]; rejected: "limit" | "duplicate" | "empty" | null };

/** Split pasted/typed text on commas and newlines, trim, cap length, drop duplicates (case-insensitive). */
export function addTags(
  current: readonly string[],
  raw: string,
  opts: { maxTags: number; maxLength: number; lowercase?: boolean },
): AddTagsResult {
  const seen = new Set(current.map((t) => t.toLowerCase()));
  const tags = [...current];
  const added: string[] = [];
  let rejected: AddTagsResult["rejected"] = null;
  const parts = raw
    .split(/[,\n\r]+/)
    .map((p) => p.trim().replace(/\s+/g, " ").slice(0, opts.maxLength))
    .filter(Boolean);
  if (parts.length === 0) return { tags, added, rejected: "empty" };
  for (const part of parts) {
    const tag = opts.lowercase ? part.toLowerCase() : part;
    if (seen.has(tag.toLowerCase())) {
      rejected ??= "duplicate";
      continue;
    }
    if (tags.length >= opts.maxTags) {
      rejected = "limit";
      break;
    }
    tags.push(tag);
    added.push(tag);
    seen.add(tag.toLowerCase());
  }
  return { tags, added, rejected: added.length > 0 ? null : rejected };
}
