/**
 * Form encoding for the Stripe API (pure, no I/O): nested params become a[b][0][c]=v.
 */
export type FormValue = string | number | boolean | null | undefined | FormValue[] | { [key: string]: FormValue };

export function encodeForm(params: Record<string, FormValue>, prefix = ""): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    const name = prefix ? `${prefix}[${key}]` : key;
    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        if (item !== null && typeof item === "object") parts.push(encodeForm(item as Record<string, FormValue>, `${name}[${index}]`));
        else if (item !== undefined && item !== null) parts.push(`${encodeURIComponent(`${name}[${index}]`)}=${encodeURIComponent(String(item))}`);
      });
    } else if (typeof value === "object") {
      parts.push(encodeForm(value as Record<string, FormValue>, name));
    } else {
      parts.push(`${encodeURIComponent(name)}=${encodeURIComponent(String(value))}`);
    }
  }
  return parts.filter(Boolean).join("&");
}
