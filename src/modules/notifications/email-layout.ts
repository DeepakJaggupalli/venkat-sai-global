/**
 * Branded HTML email layout (pure, client-safe so the admin preview can show the real email).
 * Table-based with inline CSS for email clients, 600px max width, system fonts, AA contrast
 * (navy header, teal-strong #0b7c78 button with white text), `lang`, a hidden preheader, a bulletproof
 * button with a plain-text link fallback, and a footer explaining why the email was sent, with a
 * preferences link and — for non-mandatory messages — a one-click unsubscribe link.
 */
import { escapeHtml } from "./render";

export type EmailLayoutInput = {
  locale: string;
  subject: string;
  /** Short summary shown by inboxes next to the subject (hidden in the body). */
  preheader?: string | null;
  /** HTML fragment from renderTemplate(). */
  bodyHtml: string;
  bodyText: string;
  cta?: { label: string; url: string } | null;
  brand: { name: string; legalEntity: string; address: string; homeUrl: string };
  footer: {
    /** Why the recipient got this email (one sentence). */
    reason: string;
    preferencesUrl?: string | null;
    unsubscribeUrl?: string | null;
    /** e.g. "Unsubscribe from support emails". */
    unsubscribeLabel?: string | null;
    /** Shown for mandatory messages instead of the unsubscribe link. */
    mandatoryNote?: string | null;
  };
};

export type BuiltEmail = { subject: string; html: string; text: string };

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const C = {
  navy: "#101c35",
  text: "#1f2a3d",
  muted: "#5b677d",
  border: "#e3e8ef",
  page: "#f6f8fb",
  button: "#0b7c78",
  link: "#0b7c78",
};

function ctaBlock(cta: { label: string; url: string }): string {
  const url = escapeHtml(cta.url);
  const label = escapeHtml(cta.label);
  return `
<table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin:8px 0 24px 0;">
  <tr>
    <td align="center" bgcolor="${C.button}" style="border-radius:8px;background-color:${C.button};">
      <a href="${url}" target="_blank" rel="noopener" style="display:inline-block;padding:12px 22px;font-family:${FONT};font-size:16px;line-height:24px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">${label}</a>
    </td>
  </tr>
</table>
<p style="margin:0 0 16px 0;font-size:13px;line-height:20px;color:${C.muted};">If the button does not work, copy this link into your browser:<br><a href="${url}" style="color:${C.link};text-decoration:underline;word-break:break-all;">${url}</a></p>`;
}

function footerBlock(input: EmailLayoutInput): string {
  const f = input.footer;
  const links: string[] = [];
  if (f.preferencesUrl) {
    links.push(`<a href="${escapeHtml(f.preferencesUrl)}" style="color:${C.link};text-decoration:underline;">Manage notification preferences</a>`);
  }
  if (f.unsubscribeUrl) {
    links.push(`<a href="${escapeHtml(f.unsubscribeUrl)}" style="color:${C.link};text-decoration:underline;">${escapeHtml(f.unsubscribeLabel ?? "Unsubscribe")}</a>`);
  }
  return `
<p style="margin:0 0 8px 0;">${escapeHtml(f.reason)}</p>
${f.mandatoryNote ? `<p style="margin:0 0 8px 0;">${escapeHtml(f.mandatoryNote)}</p>` : ""}
${links.length ? `<p style="margin:0 0 8px 0;">${links.join(" &nbsp;·&nbsp; ")}</p>` : ""}
<p style="margin:0;">${escapeHtml(input.brand.name)} is operated by ${escapeHtml(input.brand.legalEntity)}, ${escapeHtml(input.brand.address)}.</p>`;
}

export function buildEmail(input: EmailLayoutInput): BuiltEmail {
  const lang = escapeHtml(input.locale || "en");
  const subject = input.subject.trim() || input.brand.name;
  const preheader = (input.preheader ?? "").trim();
  const html = `<!DOCTYPE html>
<html lang="${lang}" dir="ltr" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:${C.page};-webkit-text-size-adjust:100%;">
${preheader ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${C.page};" aria-hidden="true">${escapeHtml(preheader)}</div>` : ""}
<table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="background-color:${C.page};">
  <tr>
    <td align="center" style="padding:24px 12px;">
      <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="max-width:600px;">
        <tr>
          <td style="background-color:${C.navy};border-radius:12px 12px 0 0;padding:20px 28px;">
            <a href="${escapeHtml(input.brand.homeUrl)}" style="font-family:${FONT};font-size:20px;line-height:28px;font-weight:700;color:#ffffff;text-decoration:none;">${escapeHtml(input.brand.name)}</a>
          </td>
        </tr>
        <tr>
          <td style="background-color:#ffffff;border:1px solid ${C.border};border-top:0;border-radius:0 0 12px 12px;padding:28px;font-family:${FONT};font-size:16px;line-height:24px;color:${C.text};">
            <h1 style="margin:0 0 20px 0;font-family:${FONT};font-size:22px;line-height:30px;font-weight:700;color:${C.navy};">${escapeHtml(subject)}</h1>
            ${input.bodyHtml}
            ${input.cta ? ctaBlock(input.cta) : ""}
          </td>
        </tr>
        <tr>
          <td style="padding:20px 28px;font-family:${FONT};font-size:12px;line-height:18px;color:${C.muted};">
            ${footerBlock(input)}
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;

  const lines: string[] = [subject, "", input.bodyText.trim()];
  if (input.cta) lines.push("", `${input.cta.label}: ${input.cta.url}`);
  lines.push("", "—", input.footer.reason);
  if (input.footer.mandatoryNote) lines.push(input.footer.mandatoryNote);
  if (input.footer.preferencesUrl) lines.push(`Manage notification preferences: ${input.footer.preferencesUrl}`);
  if (input.footer.unsubscribeUrl) lines.push(`${input.footer.unsubscribeLabel ?? "Unsubscribe"}: ${input.footer.unsubscribeUrl}`);
  lines.push(`${input.brand.name} is operated by ${input.brand.legalEntity}, ${input.brand.address}.`);

  return { subject, html, text: lines.join("\n") };
}
