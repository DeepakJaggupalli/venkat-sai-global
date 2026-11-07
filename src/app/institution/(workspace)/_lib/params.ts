/** Search-param helpers for Institution Portal pages (pure). Values are validated against whitelists before they reach a query. */
export type SearchParams = Record<string, string | string[] | undefined>;

export function param(sp: SearchParams, key: string): string | undefined {
  const value = sp[key];
  const first = Array.isArray(value) ? value[0] : value;
  return first?.trim() ? first.trim() : undefined;
}

export function oneOf<const T extends readonly string[]>(value: string | undefined, allowed: T): T[number] | undefined {
  return value && (allowed as readonly string[]).includes(value) ? (value as T[number]) : undefined;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function uuidParam(value: string | undefined): string | undefined {
  return value && UUID_RE.test(value) ? value.toLowerCase() : undefined;
}
