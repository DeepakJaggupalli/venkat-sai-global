import type { SelectOption } from "@/components/shared/types";

/** IANA time-zone options (computed on the server and passed down, so server and client agree). */
export function timeZoneOptions(include: readonly string[] = []): SelectOption[] {
  let zones: string[] = [];
  try {
    const supported = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf;
    zones = supported ? supported("timeZone") : [];
  } catch {
    zones = [];
  }
  const all = new Set([...include.filter(Boolean), ...zones, "UTC"]);
  return [...all].sort((a, b) => a.localeCompare(b)).map((z) => ({ value: z, label: z.replace(/_/g, " "), keywords: z.split("/") }));
}
