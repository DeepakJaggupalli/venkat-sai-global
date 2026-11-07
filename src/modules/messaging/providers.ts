import "server-only";

import { devProviders, type MessagingProviders } from "./index";

/**
 * Provider selection. PLACEHOLDER: always uses the dev outbox.
 * The infrastructure module implements SMTP (nodemailer), MSG91 / Twilio SMS and the
 * Meta WhatsApp Cloud API here, selected by EMAIL_TRANSPORT / SMS_PROVIDER / WHATSAPP_PROVIDER.
 */
export function getProviders(): MessagingProviders {
  return devProviders;
}
