/**
 * Site-wide schema.org EmploymentAgency (a LocalBusiness) JSON-LD for the homepage (pure): the office address,
 * phones, opening hours when the CMS business hours can be read, map link and sameAs (social links and the
 * WhatsApp channel). Coordinates are included only when known.
 */

type JsonLd = Record<string, unknown>;

export type LocalBusinessInput = {
  name: string;
  alternateName?: string | null;
  legalName?: string | null;
  url: string;
  logo: string;
  description?: string | null;
  slogan?: string | null;
  address: { streetAddress: string; addressLocality: string; addressRegion: string; postalCode: string; addressCountry: string };
  /** E.164 numbers, main number first. */
  phones: string[];
  email?: string | null;
  /** Free text from the site settings ("Monday to Saturday, 9:30 am to 6:00 pm IST"). */
  hours?: string | null;
  mapUrl?: string | null;
  geo?: { latitude: number; longitude: number } | null;
  sameAs?: string[];
};

const DAY_CODES: Record<string, string> = { mon: "Mo", tue: "Tu", wed: "We", thu: "Th", fri: "Fr", sat: "Sa", sun: "Su" };
const DAY = "(mon|tue|wed|thu|fri|sat|sun)[a-z]*\\.?";
const DAY_RANGE = new RegExp(`\\b${DAY}\\s*(?:to|-|–|through)\\s*${DAY}`, "i");
const TIME_RANGE = /(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?\s*(?:to|-|–)\s*(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?/i;

function to24h(hourText: string, minuteText: string | undefined, meridiem: string | undefined): string | null {
  let hour = Number(hourText);
  const minute = minuteText ? Number(minuteText) : 0;
  if (!Number.isInteger(hour) || minute > 59) return null;
  const m = meridiem?.toLowerCase().replace(/\./g, "");
  if (m) {
    if (hour < 1 || hour > 12) return null;
    if (m === "pm" && hour !== 12) hour += 12;
    if (m === "am" && hour === 12) hour = 0;
  } else if (hour > 23) return null;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/** "Monday to Saturday, 9:30 am to 6:00 pm IST" → ["Mo-Sa 09:30-18:00"]; null when it cannot be read reliably. */
export function parseOpeningHours(text: string | null | undefined): string[] | null {
  const value = text?.trim();
  if (!value) return null;
  let days: string | null = null;
  const range = DAY_RANGE.exec(value);
  if (range) days = `${DAY_CODES[range[1]!.slice(0, 3).toLowerCase()]}-${DAY_CODES[range[2]!.slice(0, 3).toLowerCase()]}`;
  else if (/\b(daily|every day|all days|7 days)\b/i.test(value)) days = "Mo-Su";
  const time = TIME_RANGE.exec(value);
  if (!days || !time) return null;
  const close = to24h(time[4]!, time[5], time[6]);
  let open = to24h(time[1]!, time[2], time[3] ?? time[6]);
  // "9:30 to 6 pm": without its own am/pm, the opening time takes the closing one only when that keeps it earlier.
  if (!time[3] && time[6] && (!open || !close || open >= close)) open = to24h(time[1]!, time[2], "am");
  if (!open || !close || open >= close) return null;
  return [`${days} ${open}-${close}`];
}

export function buildLocalBusinessJsonLd(input: LocalBusinessInput): JsonLd {
  const phones = [...new Set(input.phones.filter(Boolean))];
  const openingHours = parseOpeningHours(input.hours);
  const sameAs = [...new Set((input.sameAs ?? []).filter((u) => /^https:\/\//i.test(u)))];
  return {
    "@context": "https://schema.org",
    "@type": "EmploymentAgency",
    "@id": `${input.url.replace(/\/+$/, "")}/#organization`,
    name: input.name,
    ...(input.alternateName ? { alternateName: input.alternateName } : {}),
    ...(input.legalName ? { legalName: input.legalName } : {}),
    url: input.url,
    logo: input.logo,
    image: input.logo,
    ...(input.description ? { description: input.description } : {}),
    ...(input.slogan ? { slogan: input.slogan } : {}),
    address: { "@type": "PostalAddress", ...input.address },
    ...(phones[0] ? { telephone: phones[0] } : {}),
    ...(input.email ? { email: input.email } : {}),
    ...(input.geo ? { geo: { "@type": "GeoCoordinates", latitude: input.geo.latitude, longitude: input.geo.longitude } } : {}),
    ...(openingHours ? { openingHours } : {}),
    ...(input.mapUrl ? { hasMap: input.mapUrl } : {}),
    contactPoint: phones.map((telephone, i) => ({
      "@type": "ContactPoint",
      contactType: "customer support",
      telephone,
      ...(i === 0 && input.email ? { email: input.email } : {}),
    })),
    ...(sameAs.length ? { sameAs } : {}),
  };
}
