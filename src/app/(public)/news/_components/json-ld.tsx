/** Characters that must not appear raw inside a script element, with their JSON unicode escapes. */
const SCRIPT_UNSAFE: ReadonlyArray<[string, string]> = [0x3c, 0x3e, 0x26, 0x2028, 0x2029].map((code) => [
  String.fromCharCode(code),
  String.fromCharCode(92) + "u" + code.toString(16).padStart(4, "0"),
]);

/**
 * schema.org structured data. JSON-LD is a data block (never executed), so it needs no CSP nonce;
 * the serialiser escapes characters that could close the script element.
 */
export function serializeJsonLd(data: unknown): string {
  let json = JSON.stringify(data);
  for (const [raw, escaped] of SCRIPT_UNSAFE) json = json.replaceAll(raw, escaped);
  return json;
}

export function JsonLd({ data }: { data: Record<string, unknown> | Record<string, unknown>[] }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }} />;
}
