/**
 * Pure helpers for approval payload snapshots (client-safe, unit-tested).
 */
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** File ids referenced by a payload: string values under keys ending in "fileId" or arrays under "fileIds". */
export function collectFileIds(value: unknown, key = "", out = new Set<string>(), depth = 0): Set<string> {
  if (depth > 6 || value == null) return out;
  if (typeof value === "string") {
    if (/fileid$/i.test(key) && UUID.test(value)) out.add(value);
  } else if (Array.isArray(value)) {
    for (const v of value) collectFileIds(v, /fileids$/i.test(key) ? "fileId" : key, out, depth + 1);
  } else if (typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) collectFileIds(v, k, out, depth + 1);
  }
  return out;
}
