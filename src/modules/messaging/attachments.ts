/**
 * Email attachments (pure: no server or provider imports, unit-tested in attachments.test.ts).
 *
 * Attachments are raw bytes only, never a file path or a URL (the SMTP transport also runs with nodemailer's file
 * and URL access switched off). Used by the daily backup email. Limits keep a message well inside what common mail
 * servers accept (Gmail: 25 MB per message including the base64 overhead of about a third). The bytes are never
 * logged or stored by the dev outbox; only the name, type and size are.
 */

export type EmailAttachment = {
  /** File name shown to the recipient, e.g. "venkat-sai-full-backup-2026-11-23.xlsx". */
  filename: string;
  content: Uint8Array;
  /** MIME type, e.g. "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet". */
  contentType: string;
};

/** Total size of all attachments of one message (before base64). */
export const MAX_EMAIL_ATTACHMENT_BYTES = 15 * 1024 * 1024;
export const MAX_EMAIL_ATTACHMENTS = 5;

const CONTENT_TYPE_RE = /^[a-z0-9][a-z0-9!#$&^_.+-]{0,63}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,127}$/i;

/** Letters, digits, dot, dash and underscore only (no path, no header injection); "attachment" when nothing is left. */
export function safeAttachmentFilename(name: string): string {
  const base = String(name ?? "")
    .split(/[\\/]/)
    .pop()!
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/^[._]+/, "")
    .slice(-120);
  return base || "attachment";
}

export type AttachmentSummary = { filename: string; contentType: string; sizeBytes: number };

/** What logs and the dev outbox keep about attachments (never the bytes). */
export function describeAttachments(list: readonly EmailAttachment[] | undefined): AttachmentSummary[] {
  return (list ?? []).map((a) => ({ filename: safeAttachmentFilename(a.filename), contentType: a.contentType, sizeBytes: a.content.byteLength }));
}

export type CheckedAttachments = { ok: true; attachments: EmailAttachment[] } | { ok: false; error: string };

/** Validate a message's attachments: count, content type, non-empty bytes and the total size limit. */
export function checkAttachments(list: readonly EmailAttachment[] | undefined): CheckedAttachments {
  const attachments = [...(list ?? [])];
  if (attachments.length > MAX_EMAIL_ATTACHMENTS) return { ok: false, error: `Too many attachments (at most ${MAX_EMAIL_ATTACHMENTS})` };
  let total = 0;
  for (const a of attachments) {
    if (!(a.content instanceof Uint8Array) || a.content.byteLength === 0) return { ok: false, error: "An attachment is empty" };
    if (!CONTENT_TYPE_RE.test(a.contentType)) return { ok: false, error: "An attachment has an invalid content type" };
    total += a.content.byteLength;
  }
  if (total > MAX_EMAIL_ATTACHMENT_BYTES) return { ok: false, error: `Attachments are too large (${Math.ceil(total / 1024 / 1024)} MB; the limit is ${MAX_EMAIL_ATTACHMENT_BYTES / 1024 / 1024} MB)` };
  return { ok: true, attachments: attachments.map((a) => ({ ...a, filename: safeAttachmentFilename(a.filename) })) };
}
