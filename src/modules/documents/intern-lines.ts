import type { InternInput } from "./service";

/** Many interns at once, one per line: "Name, email, phone, college" (only the name is required). */
export function parseInternLines(text: string): { rows: InternInput[]; errors: string[] } {
  const rows: InternInput[] = [];
  const errors: string[] = [];
  text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 300)
    .forEach((line, i) => {
      const parts = line.split(/[,\t;]/).map((p) => p.trim());
      const fullName = parts[0] ?? "";
      if (fullName.length < 2) {
        errors.push(`Line ${i + 1}: enter the name first`);
        return;
      }
      const rest = parts.slice(1).filter(Boolean);
      const email = rest.find((p) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p));
      const phoneRaw = rest.find((p) => p !== email && /^\+?[\d\s()-]{7,}$/.test(p));
      const institutionName = rest.find((p) => p !== email && p !== phoneRaw);
      let phone: string | undefined;
      if (phoneRaw) {
        const digits = phoneRaw.replace(/[^\d+]/g, "");
        phone = digits.startsWith("+") ? digits : digits.length === 10 ? `+91${digits}` : `+${digits}`;
      }
      rows.push({ fullName: fullName.slice(0, 120), email: email?.toLowerCase(), phone, institutionName: institutionName?.slice(0, 200) });
    });
  return { rows, errors };
}
