# Messaging transports (`src/modules/messaging`)

Low-level email / SMS / WhatsApp transports. **Business code calls `notify()`**
(`src/modules/notifications`), which applies templates, preferences, consent and feature flags and
then uses these transports. Auth uses them directly only for one-time codes.

## Public API (`import { sendEmail, sendSms, sendWhatsApp } from "@/modules/messaging"`)

| Function | Signature |
|---|---|
| `sendEmail` | `(m: { to, subject, html, text, replyTo?, tags?, headers? }) => Promise<SendResult>` — `headers` (e.g. `List-Unsubscribe`) are sanitised by every transport (`sanitizeEmailHeaders`: CR / LF and control characters become spaces, malformed and reserved names such as From / To / Subject / Bcc are dropped); the dev outbox stores them in `metadata.headers` |
| `sendSms` | `(m: { to (E.164), body, templateId?, variables? }) => Promise<SendResult>` |
| `sendWhatsApp` | `(m: { to (E.164), templateName, languageCode, variables: string[], fallbackText? }) => Promise<SendResult>` |
| `devProviders` | the dev-outbox implementation (stores messages in `dev_outbox`) |
| `getProviders()` (`./providers`) | the provider set selected by environment |

`SendResult = { ok: true, provider, providerMessageId? } | { ok: false, provider, error }` — the
functions never throw for provider failures.

## Providers (selected by environment, see docs/OPERATIONS.md)

| Channel | Variable | Values | Implementation |
|---|---|---|---|
| Email | `EMAIL_TRANSPORT` | `dev` \| `smtp` | nodemailer SMTP (`smtp.ts`), one cached transport, sender `EMAIL_FROM` |
| SMS | `SMS_PROVIDER` | `dev` \| `msg91` \| `twilio` | MSG91 Flow API v5 with a DLT template (`sms.ts`), Twilio Messages REST API |
| WhatsApp | `WHATSAPP_PROVIDER` | `dev` \| `meta` | Meta WhatsApp Cloud API template messages (`whatsapp.ts`) |

- 10-second timeouts on every provider call (SMTP connect/greeting/socket and HTTP).
- Errors are mapped to short messages (HTTP status + provider error code/message).
- Logs contain the channel, provider, a **masked** recipient and the outcome — never message
  bodies, template variables or codes.
- MSG91 (India): free text cannot be sent; pass `templateId` (or set `MSG91_TEMPLATE_ID`) and
  `variables` matching the template's `##placeholders##` (the body is sent as `var1` when no
  variables are given). Twilio: `TWILIO_FROM` may be a number or a Messaging Service SID (`MG…`).
- WhatsApp: only pre-approved templates; `variables` fill the body parameters in order. Graph API
  version `v23.0` by default, override with `WHATSAPP_GRAPH_API_VERSION`.
- A production deployment still on a `dev` channel logs a warning once; those messages are stored
  in the dev outbox, not sent.
