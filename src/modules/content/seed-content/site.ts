import { BRAND, DEFAULT_SEO } from "@/config/site";

import { HOMEPAGE_SECTION_OPTIONS } from "../collections";
import type { SeedEntrySpec } from "./types";

/**
 * Site-wide singletons seeded with the facts we have. Contact details, social profiles and the grievance
 * officer are deliberately left empty: the website shows nothing until an administrator enters real details.
 */

export const SITE_SETTINGS_SEED: SeedEntrySpec = {
  collection: "site_settings",
  slug: "site-settings",
  title: "Site settings",
  publish: true,
  note: "Initial settings: legal entity and headquarters only. Contact details are added by an administrator.",
  data: {
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
      heading: "Connecting Global Talent With Limitless Opportunities.",
      subheading: DEFAULT_SEO.description,
      primaryCta: { label: "Explore Opportunities", href: "/jobs" },
      secondaryCta: { label: "Hire Through Venkat Sai", href: "/employers" },
      tertiaryCta: { label: "Become a Partner", href: "/partners" },
    },
    // Every section visible, in the specification's order; sections without published content hide themselves.
    sections: HOMEPAGE_SECTION_OPTIONS.map((option) => ({ key: option.value, visible: true })),
    ctaBand: {
      heading: BRAND.tagline,
      body: BRAND.promise,
      primaryCta: { label: "Create your profile", href: "/sign-up" },
      secondaryCta: { label: "Submit a workforce requirement", href: "/employers/request" },
    },
  },
};

/**
 * Header menu and footer columns matching PUBLIC_NAV (src/config/navigation.ts) and DEFAULT_FOOTER_COLUMNS
 * (src/components/layout/public-nav.ts). Kept as plain data because those modules import lucide-react, which
 * cannot load in the seed script's react-server runtime; seed-content.test.ts fails if they drift apart.
 */
const SERVICES_MENU = [
  { title: "Recruitment & placements", href: "/services/recruitment-and-placements" },
  { title: "Overseas employment", href: "/services/overseas-employment" },
  { title: "Bulk manpower supply", href: "/services/bulk-manpower-supply" },
  { title: "Training & skill development", href: "/services/professional-training" },
  { title: "Welding & industrial testing", href: "/services/welding-and-industrial-testing" },
  { title: "All services", href: "/services" },
];

const OPPORTUNITIES_MENU = [
  { title: "Jobs", href: "/jobs" },
  { title: "Overseas jobs", href: "/jobs?overseas=1" },
  { title: "Internships", href: "/jobs?type=internship" },
  { title: "Apprenticeships", href: "/jobs?type=apprenticeship" },
  { title: "Training programmes", href: "/training" },
  { title: "Events & hiring drives", href: "/events" },
];

export const NAVIGATION_SEED: SeedEntrySpec = {
  collection: "navigation",
  slug: "navigation",
  title: "Navigation",
  publish: true,
  note: "Defaults matching the built-in public navigation.",
  data: {
    headerItems: [
      { title: "About Us", href: "/about" },
      { title: "What We Do", href: "/services", children: SERVICES_MENU },
      { title: "Opportunities", href: "/jobs", children: OPPORTUNITIES_MENU },
      { title: "Industries", href: "/industries" },
      { title: "Global Reach", href: "/global-reach" },
      { title: "Employers", href: "/employers" },
      { title: "Partners", href: "/partners" },
      { title: "Success Stories", href: "/success-stories" },
      { title: "Contact", href: "/contact" },
    ],
    footerColumns: [
      { title: "What we do", links: SERVICES_MENU },
      { title: "Opportunities", links: OPPORTUNITIES_MENU },
      {
        title: "Company",
        links: [
          { title: "About Us", href: "/about" },
          { title: "Industries", href: "/industries" },
          { title: "Global Reach", href: "/global-reach" },
          { title: "Success Stories", href: "/success-stories" },
          { title: "Contact", href: "/contact" },
        ],
      },
      {
        title: "For organisations",
        links: [
          { title: "Employers", href: "/employers" },
          { title: "Post a requirement", href: "/employers/request" },
          { title: "Partners", href: "/partners" },
          { title: "Sign in", href: "/sign-in" },
        ],
      },
    ],
  },
};

const ABOUT_FACTS = {
  history:
    "<p>Venkat Sai Global is the technology platform of Venkat Sai Welding Works and Testing Center, a business based in Auto Nagar, Visakhapatnam, Andhra Pradesh, India.</p>" +
    "<p>The business works in overseas recruitment, manpower supply, welding training and welding testing.</p>",
  evolution:
    "<p>Venkat Sai Global brings these activities together on one platform, <strong>The Global Opportunity Network</strong>. Candidates can build a profile, discover jobs and training, and apply. Employers can post jobs and submit workforce requirements. Recruitment partners and training institutions can work with Venkat Sai through their own portals.</p>" +
    `<p>${BRAND.statement} ${BRAND.tagline}</p>`,
  headquarters: BRAND.headquarters,
  capabilities: [
    { title: "Overseas recruitment", description: "Recruitment of candidates for employers outside India." },
    { title: "Manpower supply", description: "Supply of skilled and semi-skilled workers for employers and projects." },
    { title: "Welding training", description: "Practical training for welders." },
    { title: "Welding testing", description: "Testing services at the Venkat Sai Welding Works and Testing Center." },
  ],
};

/**
 * Version 1 (published) holds only the facts above. Version 2 adds proposed mission, vision and values as an
 * unpublished draft for the business to review — the live page does not show them until someone publishes them.
 */
export const ABOUT_SEED: SeedEntrySpec = {
  collection: "about",
  slug: "about",
  title: "About Venkat Sai Global",
  summary: BRAND.promise,
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
