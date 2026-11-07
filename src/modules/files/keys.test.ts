import { describe, expect, it } from "vitest";

import { contentDisposition, generateStorageKey, isValidStorageKey, normalizeOriginalName, safeFileName, variantStorageKey, withExtension } from "./keys";

const ID = "0b6f3a9e-5c1d-4e2f-9a7b-1234567890ab";

describe("storage keys", () => {
  it("shards keys by UTC year/month with the file id", () => {
    expect(generateStorageKey(ID, new Date("2026-01-31T23:30:00Z"))).toBe(`2026/01/${ID}`);
    expect(generateStorageKey(ID, new Date("2026-11-07T10:00:00+05:30"))).toBe(`2026/11/${ID}`);
  });

  it("refuses ids that are not lower-case UUIDs", () => {
    expect(() => generateStorageKey("../etc/passwd")).toThrow();
    expect(() => generateStorageKey(ID.toUpperCase())).toThrow();
  });

  it("derives variant keys next to the original", () => {
    const key = generateStorageKey(ID, new Date("2026-11-07T00:00:00Z"));
    expect(variantStorageKey(key, "thumb")).toBe(`2026/11/${ID}.thumb.webp`);
    expect(isValidStorageKey(variantStorageKey(key, "lg"))).toBe(true);
  });

  it("only accepts keys produced by the module (no traversal)", () => {
    expect(isValidStorageKey(`2026/11/${ID}`)).toBe(true);
    for (const bad of [`../2026/11/${ID}`, `2026/11/${ID}/../../x`, "2026/11/abc", `/2026/11/${ID}`, `2026\\11\\${ID}`, `2026/11/${ID}.thumb.png`, ""]) {
      expect(isValidStorageKey(bad)).toBe(false);
    }
  });
});

describe("file names", () => {
  it("normalises user supplied names", () => {
    expect(normalizeOriginalName("C:\\fakepath\\My CV.pdf")).toBe("My CV.pdf");
    expect(normalizeOriginalName("../../etc/passwd")).toBe("passwd");
    expect(normalizeOriginalName("bad\u0000name\r\n.pdf")).toBe("badname.pdf");
    expect(normalizeOriginalName("   ")).toBe("file");
    expect(normalizeOriginalName(".env")).toBe("env");
    const long = `${"a".repeat(300)}.pdf`;
    const normalized = normalizeOriginalName(long);
    expect(normalized.length).toBeLessThanOrEqual(180);
    expect(normalized.endsWith(".pdf")).toBe(true);
  });

  it("produces URL/header-safe ASCII names", () => {
    expect(safeFileName("Résumé 2026 (final).PDF")).toBe("resume-2026-final.pdf");
    expect(safeFileName("photo.jpg", "webp")).toBe("photo.webp");
    expect(safeFileName("రెజ్యూమ్.pdf")).toBe("file.pdf");
    expect(safeFileName("con.txt")).toBe("file-con.txt");
    expect(safeFileName('a"b;c d.pdf')).toBe("a-b-c-d.pdf");
  });

  it("swaps extensions when the content type differs", () => {
    expect(withExtension("scan.jpeg", "jpg")).toBe("scan.jpg");
    expect(withExtension("scan", "pdf")).toBe("scan.pdf");
    expect(withExtension("scan.pdf", "pdf")).toBe("scan.pdf");
  });

  it("builds RFC 6266 Content-Disposition headers that cannot be injected", () => {
    expect(contentDisposition("attachment", "My CV.pdf")).toBe(`attachment; filename="my-cv.pdf"; filename*=UTF-8''My%20CV.pdf`);
    const header = contentDisposition("inline", 'evil"\r\nSet-Cookie: x=1.pdf');
    expect(header).not.toMatch(/[\r\n]/);
    expect(header.startsWith('inline; filename="')).toBe(true);
    expect(contentDisposition("inline", "రెజ్యూమ్.pdf")).toContain("filename*=UTF-8''%E0%B0");
  });
});
