import { INDUSTRIES } from "@/server/seed/industries";

import type { SeedEntrySpec, SeedLookups } from "./types";

/**
 * Industry pages (spec §7.6), GCC destination guides and FAQs — all seeded as DRAFTS.
 *  - Industries: neutral definitions only. The specification forbids claiming experience in an industry without
 *    evidence, so the "how we support" text is left for the business to write before publishing.
 *  - Destinations: country, region and the mandatory guidance block with an empty review (date, reviewer,
 *    sources) — guidance must be researched, sourced and reviewed before a destination can be published.
 *  - FAQs: honest basics for candidates and employers, for review.
 */

const INDUSTRY_ICONS: Record<string, string> = {
  "oil-and-gas": "fuel",
  construction: "hard-hat",
  engineering: "cog",
  shipbuilding: "ship",
  offshore: "anchor",
  manufacturing: "factory",
  fabrication: "flame",
  "power-and-energy": "zap",
  infrastructure: "landmark",
  automotive: "car",
  logistics: "truck",
  hospitality: "hotel",
  healthcare: "heart-pulse",
  "it-and-technology": "laptop",
  "banking-and-finance": "banknote",
  education: "graduation-cap",
  telecommunications: "radio-tower",
  "facility-management": "building-2",
  "industrial-maintenance": "wrench",
  mining: "pickaxe",
};

export function buildIndustrySeeds(lookups: SeedLookups): SeedEntrySpec[] {
  return INDUSTRIES.map((industry, index) => {
    const industryId = lookups.industryIdBySlug.get(industry.slug);
    return {
      collection: "industries",
      slug: industry.slug,
      title: industry.name,
      summary: industry.description,
      sortOrder: (index + 1) * 10,
      publish: false,
      note: "Draft: add how Venkat Sai supports this industry (with evidence) before publishing.",
      data: {
        overview: `<p>${industry.description}</p>`,
        ...(industryId ? { industryId } : {}),
        ...(INDUSTRY_ICONS[industry.slug] ? { iconName: INDUSTRY_ICONS[industry.slug] } : {}),
      },
    };
  });
}

const GCC_DESTINATIONS = [
  { code: "AE", slug: "united-arab-emirates", name: "United Arab Emirates" },
  { code: "SA", slug: "saudi-arabia", name: "Saudi Arabia" },
  { code: "QA", slug: "qatar", name: "Qatar" },
  { code: "KW", slug: "kuwait", name: "Kuwait" },
  { code: "OM", slug: "oman", name: "Oman" },
  { code: "BH", slug: "bahrain", name: "Bahrain" },
] as const;

export const DESTINATION_DISCLAIMER =
  "This guidance is general information, not legal or immigration advice. Employment and immigration rules change; always confirm the current requirements with the official sources before acting. Venkat Sai does not promise that any visa or work permit will be granted.";

export function buildDestinationSeeds(lookups: SeedLookups): SeedEntrySpec[] {
  const languageCodes = ["ar", "en"].filter((code) => lookups.languageCodes.has(code));
  const serviceIds = ["overseas-employment", "recruitment-and-placements", "skill-assessment"]
    .map((slug) => lookups.serviceIdBySlug.get(slug))
    .filter((id): id is string => Boolean(id));
  return GCC_DESTINATIONS.map((country, index) => ({
    collection: "destinations",
    slug: country.slug,
    title: country.name,
    sortOrder: (index + 1) * 10,
    publish: false,
    note: "Draft: research the guidance, record sources, the reviewer and the review date before publishing.",
    data: {
      countryCode: country.code,
      region: "gcc",
      ...(languageCodes.length ? { languageCodes } : {}),
      ...(serviceIds.length ? { availableServiceIds: serviceIds } : {}),
      guidance: {
        sources: [],
        disclaimer: DESTINATION_DISCLAIMER,
      },
    },
  }));
}

const NO_FEES_ANSWER =
  "<p>No. Candidates are never charged to discover, apply for, be submitted for, be interviewed for or be tested for a job through Venkat Sai Global. If anyone asks you to pay for a job, do not pay, and report it to us.</p>";

const FAQS: readonly { slug: string; question: string; audience: "candidates" | "employers"; topic: string; answer: string }[] = [
  { slug: "do-i-have-to-pay-to-apply", question: "Do I have to pay to apply for a job?", audience: "candidates", topic: "Fees", answer: NO_FEES_ANSWER },
  {
    slug: "how-do-i-create-a-profile",
    question: "How do I create a profile?",
    audience: "candidates",
    topic: "Getting started",
    answer:
      "<p>Select <strong>Join Venkat Sai</strong>, sign up with your email address or mobile number and verify it with the code we send. You can then add your experience, education, skills and documents at your own pace.</p>",
  },
  {
    slug: "who-can-see-my-profile",
    question: "Who can see my profile and contact details?",
    audience: "candidates",
    topic: "Privacy",
    answer:
      "<p>You decide. New profiles are visible only to the Venkat Sai team until you choose to make them discoverable to employers. Your contact details and documents are shared with an employer only when you apply to their job or give your consent, and you can change these choices at any time in the privacy section of the People Portal.</p>",
  },
  {
    slug: "do-you-guarantee-a-job-or-visa",
    question: "Does Venkat Sai guarantee a job or a visa?",
    audience: "candidates",
    topic: "Expectations",
    answer:
      "<p>No. We work to match you with suitable opportunities, but employers make their own hiring decisions and visas or work permits are decided by the authorities of each country.</p>",
  },
  {
    slug: "how-do-i-check-an-overseas-agent",
    question: "How do I check that an overseas recruiting agent is genuine?",
    audience: "candidates",
    topic: "Overseas jobs",
    answer:
      "<p>Recruiting agents for overseas employment must be registered with the Government of India. You can check an agent's registration on the official eMigrate portal. Never pay cash, and never pay anyone who cannot show a valid registration and a receipt.</p>",
  },
  {
    slug: "which-languages-are-available",
    question: "Can I use Venkat Sai Global in Hindi or Telugu?",
    audience: "candidates",
    topic: "Getting started",
    answer: "<p>Yes. The People Portal is available in English, Hindi and Telugu. You can change the language from the menu at any time.</p>",
  },
  {
    slug: "how-do-i-hire-through-venkat-sai",
    question: "How do I hire through Venkat Sai?",
    audience: "employers",
    topic: "Getting started",
    answer:
      "<p>Register your organisation and complete verification. You can then post jobs in the Employer Portal, or submit a workforce requirement and the Venkat Sai team will contact you to discuss it.</p>",
  },
  {
    slug: "why-do-you-verify-employers",
    question: "Why do you verify employers?",
    audience: "employers",
    topic: "Verification",
    answer:
      "<p>Verification protects candidates from fake or misleading job offers. Jobs are published only for verified organisations, and the verified mark shows which details Venkat Sai has checked.</p>",
  },
  {
    slug: "can-i-submit-a-bulk-requirement",
    question: "Can I submit a requirement for many workers?",
    audience: "employers",
    topic: "Workforce requirements",
    answer:
      "<p>Yes. Use the workforce requirement form to list the trades, numbers, location and timeline you need. The Venkat Sai team reviews every requirement and gets back to you.</p>",
  },
  { slug: "do-candidates-pay-anything", question: "Do candidates pay anything when I hire through Venkat Sai?", audience: "employers", topic: "Fees", answer: NO_FEES_ANSWER },
];

export function buildFaqSeeds(): SeedEntrySpec[] {
  return FAQS.map((faq, index) => ({
    collection: "faqs",
    slug: faq.slug,
    title: faq.question,
    sortOrder: (index + 1) * 10,
    publish: false,
    note: "Draft FAQ for review.",
    data: { answer: faq.answer, audience: faq.audience, topic: faq.topic },
  }));
}
