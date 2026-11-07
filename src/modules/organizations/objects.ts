/** Small object helpers (pure, client-safe). */

/** Copy of `obj` without `keys` — used to strip internal fields (staff notes, scores) from member / candidate views. */
export function omit<T extends object, K extends keyof T>(obj: T, keys: readonly K[]): Omit<T, K> {
  const copy: Partial<T> = { ...obj };
  for (const key of keys) delete copy[key];
  return copy as Omit<T, K>;
}
