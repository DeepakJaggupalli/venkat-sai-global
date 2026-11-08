import { CONTACT } from "@/config/contact";
import { BRAND, DEFAULT_SEO } from "@/config/site";

import { HOMEPAGE_SECTION_OPTIONS } from "../collections";
import type { SeedEntrySpec } from "./types";

/**
 * Site-wide singletons seeded with the facts we have. Contact details are the business's own (src/config/contact.ts);
 * social profiles and the grievance officer are deliberately left empty until an administrator enters real details.
 */

export const SITE_SETTINGS_SEED: SeedEntrySpec = {
  collection: "site_settings",
  slug: "site-settings",
  title: "Site settings",
  publish: true,
  note: "Initial settings: legal entity, headquarters and the business contact details.",
  data: {
    contact: {
      phone: CONTACT.whatsapp.e164,
      email: CONTACT.emails.primary,
      whatsappNumber: CONTACT.whatsapp.e164,
      address: CONTACT.address.oneLine,
      mapEmbedUrl: CONTACT.maps.embedUrl,
    },
    legalEntity: {
      name: BRAND.legalEntity,
      headquarters: BRAND.headquarters,
    },
  },
};

export const HOMEPAGE_SEED: SeedEntrySpec = {
  collection: "homepage",
  slug: "homepage",
  title: "Homepage",
  publish: true,
  note: "Initial homepage copy from the product specification.",
  seo: { title: DEFAULT_SEO.title, description: DEFAULT_SEO.description },
  data: {
    hero: {
      heading: "Skilled hands from Vizag to the world",
      subheading:
        "We train welders, fitters, electricians and riggers in Visakhapatnam and connect them with employers in the Gulf, Europe and Asia. Applying for a job is always free.",
      primaryCta: { label: "Explore jobs", href: "/jobs" },
      secondaryCta: { label: "Send your CV", href: "/send-cv" },
    },
    // Every section visible, in the specification's order; sections without published content hide themselves.
    sections: HOMEPAGE_SECTION_OPTIONS.map((option) => ({ key: option.value, visible: true })),
    ctaBand: {
      heading: "Your next job could be abroad",
      body: "Send your CV and trade today. We call you when a matching requirement opens.",
      primaryCta: { label: "Send your CV", href: "/send-cv" },
      secondaryCta: { label: "Explore jobs", href: "/jobs" },
    },
  },
};

/**
 * Header menu and footer columns matching PUBLIC_NAV (src/config/navigation.ts) and DEFAULT_FOOTER_COLUMNS
 * (src/components/layout/public-nav.ts). Kept as plain data because those modules import lucide-react, which
 * cannot load in the seed script's react-server runtime; seed-content.test.ts fails if they drift apart.
 */
const FIND_WORK_LINKS = [
  { title: "Jobs", href: "/jobs" },
  { title: "Overseas jobs", href: "/jobs?overseas=1" },
  { title: "Latest requirements", href: "/requirements" },
  { title: "Send your CV", href: "/send-cv" },
  { title: "Training courses", href: "/training" },
];

const SERVICES_LINKS = [
  { title: "Overseas employment", href: "/services/overseas-employment" },
  { title: "Training", href: "/services/technical-training" },
  { title: "Manpower supply", href: "/services/bulk-manpower-supply" },
  { title: "All services", href: "/services" },
];

const COMPANY_LINKS = [
  { title: "About us", href: "/about" },
  { title: "Contact", href: "/contact" },
  { title: "For employers", href: "/employers" },
  { title: "Request workers", href: "/employers/request" },
  { title: "We never charge candidates", href: "/safe-recruitment" },
  { title: "Verify a certificate", href: "/verify-certificate" },
];

export const NAVIGATION_SEED: SeedEntrySpec = {
  collection: "navigation",
  slug: "navigation",
  title: "Navigation",
  publish: true,
  note: "Defaults matching the built-in public navigation.",
  data: {
    headerItems: [
      { title: "Home", href: "/" },
      { title: "Jobs", href: "/jobs" },
      { title: "Training", href: "/training" },
      { title: "Services", href: "/services" },
      { title: "Requirements", href: "/requirements" },
      { title: "About", href: "/about" },
      { title: "Contact", href: "/contact" },
    ],
    footerColumns: [
      { title: "Find work", links: FIND_WORK_LINKS },
      { title: "Services", links: SERVICES_LINKS },
      { title: "Company", links: COMPANY_LINKS },
    ],
  },
};

const ABOUT_FACTS = {
  history:
    "<p>Venkat Sai Welding Works and Testing Center is a training, testing and recruitment centre in Autonagar, Gajuwaka, Visakhapatnam, Andhra Pradesh. Despite the name, we do much more than welding.</p>" +
    "<p>We train and test tradespeople in welding, pipe fitting, structural fitting and fabrication, piping, electrical work, rigging, scaffolding and mechanical fitting, with safety and NDT testing awareness for every trade. Trained candidates are put forward for jobs abroad, in the UAE, Saudi Arabia, Qatar, Kuwait, Oman, Bahrain, Europe, Russia, Singapore, Malaysia and other countries, and we supply skilled and semi-skilled manpower to companies in India and abroad.</p>" +
    "<p>Candidates are never charged placement fees.</p>",
  evolution:
    "<p>Venkat Sai Global brings this work online as <strong>The Global Opportunity Network</strong>. Candidates can send their CV and trade, see our latest requirements, and find training. Companies can tell us the trades and numbers they need. Recruitment partners and training institutions can work with us through their own portals.</p>" +
    `<p>${BRAND.statement} ${BRAND.tagline}</p>`,
  headquarters: CONTACT.address.oneLine,
  capabilities: [
    { title: "Trade training", description: "Welding, pipe fitting, fabrication, electrical, piping, rigging, scaffolding, mechanical fitting and safety." },
    { title: "Trade testing", description: "Practical trade tests and welder assessments, including 6G pipe, at our Autonagar centre." },
    { title: "Overseas employment", description: "CV selection, interviews, visa, medical, documents and travel for jobs abroad." },
    { title: "Manpower supply", description: "Skilled and semi-skilled tradespeople for companies in India and abroad." },
    { title: "Internships", description: "Workshop internships with an offer letter, certificate and letter of recommendation." },
  ],
  infrastructure:
    "<p>Training and trade tests take place at our own workshop at B-Block, Plot D-6, Autonagar, Gajuwaka, where trainees practise on real materials and equipment under supervision.</p>",
};

/**
 * Version 1 (published) holds only the facts above. Version 2 adds proposed mission, vision and values as an
 * unpublished draft for the business to review — the live page does not show them until someone publishes them.
 */
export const ABOUT_SEED: SeedEntrySpec = {
  collection: "about",
  slug: "about",
  title: "About Venkat Sai Global",
  summary:
    "Training, trade testing, overseas employment and manpower supply from Autonagar, Gajuwaka, Visakhapatnam, for welders, fitters, electricians, riggers, scaffolders and other tradespeople.",
  publish: true,
  note: "Company background, evolution into Venkat Sai Global and headquarters (facts only).",
  data: ABOUT_FACTS,
  draftVersions: [
    {
      note: "Proposed mission, vision and values for review. Edit them before publishing; nothing here is live yet.",
      data: {
        ...ABOUT_FACTS,
        mission: BRAND.promise,
        vision: `${BRAND.statement} A single place where people and organisations can discover opportunities, learn, qualify, work and grow.`,
        values: [
          { title: "Honesty", description: "We publish only what we can show to be true, and we tell people clearly what we can and cannot do." },
          { title: "Fairness to candidates", description: "Candidates are never charged to apply for, be considered for or be tested for a job." },
          { title: "Privacy", description: "People decide who sees their details, and we protect the personal data entrusted to us." },
          { title: "Skill and safety", description: "We value practical skill and safe working, learned and tested properly." },
          { title: "Accountability", description: "We keep records, follow the law, and answer complaints promptly." },
        ],
      },
    },
  ],
};
