import { describe, expect, it } from "vitest";

import { checkAttachments, describeAttachments, MAX_EMAIL_ATTACHMENT_BYTES, MAX_EMAIL_ATTACHMENTS, safeAttachmentFilename, type EmailAttachment } from "./attachments";
import { buildSmtpAttachments } from "./smtp";

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const file = (bytes: number, overrides: Partial<EmailAttachment> = {}): EmailAttachment => ({ filename: "backup.xlsx", content: new Uint8Array(bytes).fill(7), contentType: XLSX, ...overrides });

describe("email attachments", () => {
  it("keeps safe file names (no paths, no header injection)", () => {
    expect(safeAttachmentFilename("venkat-sai-full-backup-2026-11-23.xlsx")).toBe("venkat-sai-full-backup-2026-11-23.xlsx");
    expect(safeAttachmentFilename("../../etc/passwd")).toBe("passwd");
    expect(safeAttachmentFilename("C:\\Users\\x\\report.xlsx")).toBe("report.xlsx");
    expect(safeAttachmentFilename("a\r\nBcc: x@y.z.xlsx")).toBe("a_Bcc_x_y.z.xlsx");
    expect(safeAttachmentFilename(".hidden")).toBe("hidden");
    expect(safeAttachmentFilename("")).toBe("attachment");
    expect(safeAttachmentFilename(`${"x".repeat(300)}.xlsx`)).toHaveLength(120);
    expect(safeAttachmentFilename(`${"x".repeat(300)}.xlsx`).endsWith(".xlsx")).toBe(true);
  });

  it("accepts valid attachments and refuses empty, oversized, badly typed or too many", () => {
    const okResult = checkAttachments([file(10, { filename: "my backup?.xlsx" })]);
    expect(okResult.ok).toBe(true);
    expect(okResult.ok && okResult.attachments[0]!.filename).toBe("my_backup_.xlsx");
    expect(checkAttachments(undefined)).toEqual({ ok: true, attachments: [] });

    expect(checkAttachments([file(0)])).toMatchObject({ ok: false, error: "An attachment is empty" });
    expect(checkAttachments([file(10, { contentType: "text/plain\r\nX: y" })])).toMatchObject({ ok: false });
    expect(checkAttachments(Array.from({ length: MAX_EMAIL_ATTACHMENTS + 1 }, () => file(1)))).toMatchObject({ ok: false });
    const tooBig = checkAttachments([file(MAX_EMAIL_ATTACHMENT_BYTES), file(1)]);
    expect(tooBig.ok).toBe(false);
    expect(!tooBig.ok && tooBig.error).toContain("too large");
  });

  it("describes attachments without their bytes", () => {
    expect(describeAttachments([file(42)])).toEqual([{ filename: "backup.xlsx", contentType: XLSX, sizeBytes: 42 }]);
    expect(describeAttachments(undefined)).toEqual([]);
  });

  it("passes SMTP attachments as byte buffers only, and nothing for ordinary emails", () => {
    expect(buildSmtpAttachments({})).toBeUndefined();
    expect(buildSmtpAttachments({ attachments: [] })).toBeUndefined();
    const bytes = new Uint8Array([1, 2, 3, 4, 5]).subarray(1, 4);
    const [a] = buildSmtpAttachments({ attachments: [{ filename: "../x.xlsx", content: bytes, contentType: XLSX }] })!;
    expect(a).toEqual({ filename: "x.xlsx", content: Buffer.from([2, 3, 4]), contentType: XLSX });
    expect(Object.keys(a!).sort()).toEqual(["content", "contentType", "filename"]);
  });
});
