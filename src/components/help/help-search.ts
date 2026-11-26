/**
 * Help page filter (client-safe, pure — unit-tested in help-search.test.ts): every word typed must appear somewhere in
 * the topic's text, ignoring case, accents and punctuation. "Invoice pay" matches "Record payments against
 * an invoice".
 */

function fold(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Lower-cased words of the query (at most 8, each up to 40 characters). */
export function normalizeHelpQuery(query: string): string[] {
  return fold(query.slice(0, 120))
    .split(" ")
    .filter(Boolean)
    .slice(0, 8)
    .map((w) => w.slice(0, 40));
}

/** True when every term appears in the joined texts (or there are no terms). */
export function matchesHelpQuery(terms: readonly string[], texts: readonly string[]): boolean {
  if (terms.length === 0) return true;
  const haystack = fold(texts.join(" "));
  return terms.every((term) => haystack.includes(term));
}
