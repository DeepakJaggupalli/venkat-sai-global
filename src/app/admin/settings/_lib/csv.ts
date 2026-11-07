/**
 * Minimal RFC-4180 CSV reader for taxonomy imports (pure). Handles quoted fields, escaped quotes,
 * CRLF/LF line endings and a UTF-8 BOM. Returns header-keyed rows; header names are trimmed.
 * Exports are written with `toCsv` from `@/lib/http` (which neutralises spreadsheet formulas), so a
 * leading apostrophe added there is stripped here on the way back in.
 */
export function parseCsv(text: string): string[][] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"' && field === "") quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

export function csvRecords(text: string): { headers: string[]; records: Record<string, string>[] } {
  const rows = parseCsv(text);
  if (!rows.length) return { headers: [], records: [] };
  const headers = rows[0]!.map((h) => h.trim());
  const records = rows.slice(1).map((r) => {
    const rec: Record<string, string> = {};
    headers.forEach((h, i) => {
      let v = (r[i] ?? "").trim();
      if (/^'[=+\-@]/.test(v)) v = v.slice(1);
      rec[h] = v;
    });
    return rec;
  });
  return { headers, records };
}

/** "yes"/"true"/"1" → true, "no"/"false"/"0" → false, blank → undefined, anything else → null (invalid). */
export function csvBool(value: string | undefined): boolean | undefined | null {
  const v = (value ?? "").trim().toLowerCase();
  if (v === "") return undefined;
  if (["true", "yes", "y", "1"].includes(v)) return true;
  if (["false", "no", "n", "0"].includes(v)) return false;
  return null;
}

/** Synonyms / lists in one cell separated by "|" or ";". */
export function csvList(value: string | undefined): string[] {
  return (value ?? "")
    .split(/[|;]/)
    .map((s) => s.trim())
    .filter(Boolean);
}
