/**
 * Small FormData readers for adapting form posts to the typed inputs of module actions (client-safe,
 * pure). Unit-tested in form-data.test.ts.
 */

/** Trimmed text value, or undefined when missing / blank. */
export function formText(fd: FormData, key: string): string | undefined {
  const v = fd.get(key);
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t === "" ? undefined : t;
}

/**
 * Patch semantics for partial updates: a field absent from the form → undefined (keep the current
 * value); present but blank → null (clear it); otherwise the trimmed text.
 */
export function formPatch(fd: FormData, key: string): string | null | undefined {
  if (!fd.has(key)) return undefined;
  return formText(fd, key) ?? null;
}

/** Checkbox / boolean: true when any submitted value is "true", "on" or "1". */
export function formBool(fd: FormData, key: string): boolean {
  return fd.getAll(key).some((v) => v === "true" || v === "on" || v === "1");
}

/** Repeated values (`name[]` or repeated `name`), trimmed, de-duplicated, blanks removed. */
export function formList(fd: FormData, key: string): string[] {
  const values = [...fd.getAll(`${key}[]`), ...fd.getAll(key)].filter((v): v is string => typeof v === "string").map((v) => v.trim());
  return [...new Set(values.filter(Boolean))];
}

/** Decimal number or undefined. */
export function formNumber(fd: FormData, key: string): number | undefined {
  const t = formText(fd, key);
  if (t === undefined) return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}
