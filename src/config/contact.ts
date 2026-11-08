/**
 * Venkat Sai business contact details (single source of truth for the public site).
 * The CMS site settings (contact group) override phone, email, WhatsApp, address and map when filled in;
 * these values are the defaults and the fallback. Keep numbers in E.164 for links.
 */
export const CONTACT = {
  businessName: "Venkat Sai Welding Works and Testing Center",
  brandName: "Venkat Sai Global",
  /** Main WhatsApp / call number (also used for the floating WhatsApp button). */
  whatsapp: { e164: "+919494263388", display: "94942 63388" },
  phones: [
    { e164: "+919494263388", display: "94942 63388" },
    { e164: "+917386649477", display: "73866 49477" },
    { e164: "+917780453087", display: "77804 53087" },
    { e164: "+919059955784", display: "90599 55784" },
    { e164: "+919441339848", display: "94413 39848" },
  ],
  emails: { primary: "vsweld@gmail.com", hr: "hrvsweld@gmail.com" },
  /** Official WhatsApp channel (latest requirements). The business is most active on WhatsApp: prefer WhatsApp/call CTAs, email second. */
  whatsappChannelUrl: "https://whatsapp.com/channel/0029Vb75ZOP47XeC5hC3Il1B",
  address: {
    lines: ["B-Block, Plot D-6, Autonagar", "Gajuwaka, Visakhapatnam", "Andhra Pradesh 530012, India"],
    oneLine: "B-Block, Plot D-6, Autonagar, Gajuwaka, Visakhapatnam, Andhra Pradesh 530012",
  },
  maps: {
    /** Google Maps place link shared by the business (opens the Maps app on phones). */
    shareUrl: "https://share.google/70beNLsbAqlhudyTf",
    /** Key-less Google Maps embed (frame-src www.google.com is allowed by the CSP). */
    embedUrl: "https://www.google.com/maps?q=Venkat+Sai+Welding+Works+and+Testing+Center,+Autonagar,+Gajuwaka,+Visakhapatnam&output=embed",
  },
} as const;

/** wa.me link with an optional prefilled message. */
export function whatsappHref(message?: string, e164: string = CONTACT.whatsapp.e164): string {
  const n = e164.replace(/[^\d]/g, "");
  return message ? `https://wa.me/${n}?text=${encodeURIComponent(message)}` : `https://wa.me/${n}`;
}

export function telHref(e164: string = CONTACT.whatsapp.e164): string {
  return `tel:${e164}`;
}

export function mailtoHref(email: string = CONTACT.emails.primary, subject?: string, body?: string): string {
  const params = new URLSearchParams();
  if (subject) params.set("subject", subject);
  if (body) params.set("body", body);
  const q = params.toString().replace(/\+/g, "%20");
  return `mailto:${email}${q ? `?${q}` : ""}`;
}
