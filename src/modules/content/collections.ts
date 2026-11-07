/**
 * The typed registry of CMS collections (client-safe).
 *
 * Each collection declares its entry `data` fields once (see fields.ts). From that declaration the module derives
 * the zod schemas used on save (draft) and publish, the TypeScript type of published data (`CollectionData<K>`),
 * the editor descriptors (`describeCollection()`), search text, media usage and reference resolution.
 *
 * Common, non-data fields live on the entry itself (title, slug, summary, SEO, tags, hero image, featured flag,
 * sort order, schedule, consent evidence) and are edited by the generic editor for every collection.
 */
import type { z } from "zod";

import type { CmsCollection, CmsSingletonCollection } from "@/db/schema";

import {
  CMS_COLLECTION_VALUES,
  ENQUIRY_TYPE_OPTION_LABELS,
  ENQUIRY_TYPE_OPTION_VALUES,
  isSingletonCollection,
  MARKET_REGION_LABELS,
  MARKET_REGION_VALUES,
  singletonSlug,
} from "./constants";
import {
  buildObjectSchema,
  type DataOf,
  dropUndefined,
  field,
  type FieldMap,
  isValidCalendarDate,
  type SchemaMode,
  serializeFields,
  type SerializedField,
} from "./fields";

type Json = Record<string, unknown>;
export type IssueFn = (path: (string | number)[], message: string) => void;

export type CollectionSort = "manual" | "newest" | "event_start";

export type CollectionDefinition<F extends FieldMap = FieldMap> = {
  readonly key: CmsCollection;
  readonly label: string;
  readonly singularLabel: string;
  /** One line for the admin collection list. */
  readonly description: string;
  readonly singleton: boolean;
  readonly fields: F;
  /** Data field filtered by `getPublishedEntries(collection, { category })`. */
  readonly categoryField?: string;
  readonly defaultSort: CollectionSort;
  /** Publishing requires consent evidence (cms_entries_consent_required_chk). */
  readonly consentRequired: boolean;
  /** Publication always goes through this approval type (see README: consent-sensitive content). */
  readonly approvalType?: "testimonial" | "case_study";
  /** Included in public site search. */
  readonly searchable: boolean;
  /** Whether the entry hero image (heroAssetId) is used by the public pages. */
  readonly usesHero: boolean;
  /** Public URL of an entry (null = no page of its own). */
  publicPath(slug: string): string | null;
  /** Cross-field rules, run after field validation. */
  refine?(data: Json, issue: IssueFn, mode: SchemaMode): void;
};

function defineCollection<const F extends FieldMap>(definition: CollectionDefinition<F>): CollectionDefinition<F> {
  return definition;
}

// ---------------------------------------------------------------------------
// Shared option lists and field fragments
// ---------------------------------------------------------------------------

/** lucide-react icon names (kebab-case) the public site maps to components. */
export const ICON_NAMES = [
  "anchor", "award", "badge-check", "banknote", "book-open", "boxes", "briefcase", "building-2", "car", "clipboard-check",
  "cog", "compass", "cpu", "factory", "flame", "fuel", "globe", "graduation-cap", "hammer", "handshake", "hard-hat",
  "heart-pulse", "hotel", "landmark", "laptop", "layers", "lightbulb", "map", "pickaxe", "plane", "radio-tower", "route",
  "school", "search", "settings", "shield-check", "ship", "target", "truck", "user-check", "users", "utensils", "wrench", "zap",
] as const;
export type IconName = (typeof ICON_NAMES)[number];

const iconOptions = ICON_NAMES.map((value) => ({ value, label: value.replace(/-/g, " ") }));

const enquiryTypeOptions = ENQUIRY_TYPE_OPTION_VALUES.map((value) => ({ value, label: ENQUIRY_TYPE_OPTION_LABELS[value] }));
const regionOptions = MARKET_REGION_VALUES.map((value) => ({ value, label: MARKET_REGION_LABELS[value] }));

export const SOCIAL_PLATFORM_OPTIONS = [
  { value: "linkedin", label: "LinkedIn" },
  { value: "facebook", label: "Facebook" },
  { value: "instagram", label: "Instagram" },
  { value: "youtube", label: "YouTube" },
  { value: "x", label: "X" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "telegram", label: "Telegram" },
  { value: "other", label: "Other website" },
] as const;

export const HOMEPAGE_SECTION_OPTIONS = [
  { value: "metrics", label: "Credibility figures (approved public statistics only)" },
  { value: "about", label: "About Venkat Sai" },
  { value: "services", label: "What we do (services)" },
  { value: "opportunities", label: "Opportunities (jobs, internships, training)" },
  { value: "industries", label: "Industries" },
  { value: "global_reach", label: "Global reach (destinations)" },
  { value: "employers", label: "For employers" },
  { value: "candidates", label: "For candidates" },
  { value: "partners", label: "For recruitment partners" },
  { value: "institutions", label: "For institutions" },
  { value: "success_stories", label: "Success stories (published case studies only)" },
  { value: "news", label: "Latest news" },
  { value: "cta_band", label: "Closing call to action" },
] as const;
export type HomepageSectionKey = (typeof HOMEPAGE_SECTION_OPTIONS)[number]["value"];

export const NEWS_CATEGORY_OPTIONS = [
  { value: "news", label: "News" },
  { value: "announcement", label: "Announcement" },
  { value: "company_update", label: "Company update" },
  { value: "placement_announcement", label: "Placement announcement" },
  { value: "hiring_drive", label: "Hiring drive" },
  { value: "training_announcement", label: "Training announcement" },
] as const;

export const EVENT_TYPE_OPTIONS = [
  { value: "career_event", label: "Career event" },
  { value: "job_fair", label: "Job fair" },
  { value: "hiring_drive", label: "Hiring drive" },
  { value: "webinar", label: "Webinar" },
  { value: "campus_drive", label: "Campus drive" },
] as const;

export const EVENT_FORMAT_OPTIONS = [
  { value: "in_person", label: "In person" },
  { value: "online", label: "Online" },
  { value: "hybrid", label: "In person and online" },
] as const;

export const TESTIMONIAL_TYPE_OPTIONS = [
  { value: "candidate", label: "Candidate" },
  { value: "trainee", label: "Trainee" },
  { value: "employer", label: "Employer" },
  { value: "partner", label: "Recruitment partner" },
  { value: "institution", label: "Institution" },
  { value: "other", label: "Other" },
] as const;

export const FAQ_AUDIENCE_OPTIONS = [
  { value: "candidates", label: "Candidates" },
  { value: "employers", label: "Employers" },
  { value: "partners", label: "Recruitment partners" },
  { value: "institutions", label: "Institutions" },
  { value: "general", label: "General" },
] as const;

export const PAGE_TYPE_OPTIONS = [
  { value: "legal", label: "Legal / policy" },
  { value: "static", label: "Static page" },
] as const;

export const TEAM_GROUP_OPTIONS = [
  { value: "leadership", label: "Leadership" },
  { value: "team", label: "Team" },
] as const;

/** Fixed public routes of the legal pages (docs/CONVENTIONS.md §7); other pages live at /<slug>. */
export const LEGAL_PAGE_PATHS: Readonly<Record<string, string>> = {
  "privacy-policy": "/legal/privacy-policy",
  terms: "/legal/terms",
  "cookie-policy": "/legal/cookie-policy",
  "data-rights": "/legal/data-rights",
  accessibility: "/legal/accessibility",
  disclaimers: "/legal/disclaimers",
  "grievance-redressal": "/grievance",
  careers: "/careers",
};

const cta = (label: string, help?: string) =>
  field.group({
    label,
    help,
    fields: {
      label: field.text({ label: "Button text", maxLength: 60, required: true }),
      href: field.url({ label: "Link", allowRelative: true, required: true, help: "A site path such as /jobs, or a full https:// link." }),
    },
  });

const titledItems = (label: string, itemLabel: string, help?: string) =>
  field.list({
    label,
    help,
    itemLabel,
    titleField: "title",
    maxItems: 30,
    fields: {
      title: field.text({ label: "Title", maxLength: 160, required: true }),
      description: field.textarea({ label: "Description", maxLength: 1_500 }),
    },
  });

const faqList = () =>
  field.list({
    label: "Frequently asked questions",
    itemLabel: "Question",
    titleField: "question",
    maxItems: 40,
    fields: {
      question: field.text({ label: "Question", maxLength: 300, required: true }),
      answer: field.textarea({ label: "Answer", maxLength: 3_000, required: true }),
    },
  });

const navLink = {
  title: field.text({ label: "Label", maxLength: 60, required: true }),
  href: field.url({ label: "Link", allowRelative: true, required: true }),
  description: field.text({ label: "Short description (desktop menus)", maxLength: 140 }),
};

const footerLink = {
  title: field.text({ label: "Label", maxLength: 60, required: true }),
  href: field.url({ label: "Link", allowRelative: true, required: true }),
};

function isFutureDate(value: unknown): boolean {
  return typeof value === "string" && isValidCalendarDate(value) && value > new Date().toISOString().slice(0, 10);
}

function asObject(value: unknown): Json | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Json) : undefined;
}

// ---------------------------------------------------------------------------
// Singletons
// ---------------------------------------------------------------------------

const siteSettings = defineCollection({
  key: "site_settings",
  label: "Site settings",
  singularLabel: "Site settings",
  description: "Contact details, social links, grievance officer, legal entity and footer text used across the website.",
  singleton: true,
  defaultSort: "manual",
  consentRequired: false,
  searchable: false,
  usesHero: false,
  publicPath: () => "/",
  fields: {
    contact: field.group({
      label: "Contact details",
      help: "Only fill in details that are in use. Empty fields are not shown on the website.",
      fields: {
        phone: field.phone({ label: "Phone" }),
        email: field.email({ label: "Email" }),
        whatsappNumber: field.phone({ label: "WhatsApp number" }),
        address: field.textarea({ label: "Address", maxLength: 500, rows: 3 }),
        businessHours: field.textarea({ label: "Business hours", maxLength: 300, rows: 2, placeholder: "Monday to Saturday, 9:30 am to 6:00 pm IST" }),
        mapEmbedUrl: field.url({ label: "Map embed link", urlKind: "map", help: "Google Maps → Share → Embed a map → copy the src link, or an OpenStreetMap embed link." }),
      },
    }),
    socialLinks: field.list({
      label: "Social profiles",
      itemLabel: "Profile",
      titleField: "platform",
      maxItems: 12,
      fields: {
        platform: field.select({ label: "Platform", options: SOCIAL_PLATFORM_OPTIONS, required: true }),
        url: field.url({ label: "Profile link", required: true }),
        label: field.text({ label: "Label (optional)", maxLength: 60 }),
      },
    }),
    grievanceOfficer: field.group({
      label: "Grievance officer",
      help: "Published on the grievance redressal page as required by the IT Rules and the DPDP Act. Leave empty until appointed.",
      fields: {
        name: field.text({ label: "Name", maxLength: 120 }),
        designation: field.text({ label: "Designation", maxLength: 120 }),
        email: field.email({ label: "Email" }),
        phone: field.phone({ label: "Phone" }),
        address: field.textarea({ label: "Postal address", maxLength: 500, rows: 3 }),
      },
    }),
    legalEntity: field.group({
      label: "Legal entity",
      required: true,
      fields: {
        name: field.text({ label: "Registered business name", maxLength: 200, required: true }),
        headquarters: field.text({ label: "Headquarters", maxLength: 200 }),
        registeredAddress: field.textarea({ label: "Registered address", maxLength: 500, rows: 3 }),
        registrations: field.list({
          label: "Registrations",
          help: "Only registrations the business holds and has verified (for example GSTIN). Never enter a number you have not checked.",
          itemLabel: "Registration",
          titleField: "label",
          maxItems: 10,
          fields: {
            label: field.text({ label: "Registration", maxLength: 80, required: true, placeholder: "GSTIN" }),
            value: field.text({ label: "Number", maxLength: 80, required: true }),
          },
        }),
      },
    }),
    footerText: field.textarea({ label: "Footer text", maxLength: 600, rows: 3 }),
  },
});

const homepage = defineCollection({
  key: "homepage",
  label: "Homepage",
  singularLabel: "Homepage",
  description: "Hero, section order and visibility, featured items and the closing call to action.",
  singleton: true,
  defaultSort: "manual",
  consentRequired: false,
  searchable: false,
  usesHero: false,
  publicPath: () => "/",
  fields: {
    hero: field.group({
      label: "Hero",
      required: true,
      fields: {
        heading: field.text({ label: "Heading", maxLength: 120, required: true }),
        subheading: field.textarea({ label: "Supporting text", maxLength: 400, rows: 3 }),
        primaryCta: cta("Primary call to action"),
        secondaryCta: cta("Secondary call to action"),
        tertiaryCta: cta("Third call to action"),
        mediaAssetId: field.asset({ label: "Hero image or video", kinds: ["image", "video", "embed"] }),
      },
    }),
    sections: field.list({
      label: "Sections",
      help: "Order and visibility of the homepage sections. Sections with no published content hide themselves.",
      itemLabel: "Section",
      titleField: "key",
      maxItems: 20,
      fields: {
        key: field.select({ label: "Section", options: HOMEPAGE_SECTION_OPTIONS, required: true }),
        visible: field.boolean({ label: "Show this section", defaultValue: true }),
        heading: field.text({ label: "Heading (optional override)", maxLength: 120 }),
        intro: field.textarea({ label: "Introduction (optional)", maxLength: 500, rows: 2 }),
      },
    }),
    featuredServiceIds: field.reference({ label: "Featured services", target: { kind: "collection", collection: "services" }, multiple: true, maxItems: 12 }),
    featuredIndustryIds: field.reference({ label: "Featured industries", target: { kind: "collection", collection: "industries" }, multiple: true, maxItems: 20 }),
    featuredCaseStudyIds: field.reference({ label: "Featured success stories", target: { kind: "collection", collection: "case_studies" }, multiple: true, maxItems: 6 }),
    ctaBand: field.group({
      label: "Closing call to action",
      fields: {
        heading: field.text({ label: "Heading", maxLength: 120 }),
        body: field.textarea({ label: "Text", maxLength: 400, rows: 2 }),
        primaryCta: cta("Primary button"),
        secondaryCta: cta("Secondary button"),
      },
    }),
  },
  refine(data, issue) {
    const sections = Array.isArray(data.sections) ? data.sections : [];
    const seen = new Set<string>();
    sections.forEach((section, index) => {
      const key = asObject(section)?.key;
      if (typeof key !== "string") return;
      if (seen.has(key)) issue(["sections", index, "key"], "Each section can only be listed once");
      seen.add(key);
    });
  },
});

const navigation = defineCollection({
  key: "navigation",
  label: "Navigation",
  singularLabel: "Navigation",
  description: "Header menu (with dropdown groups) and footer link columns.",
  singleton: true,
  defaultSort: "manual",
  consentRequired: false,
  searchable: false,
  usesHero: false,
  publicPath: () => "/",
  fields: {
    headerItems: field.list({
      label: "Header menu",
      itemLabel: "Menu item",
      titleField: "title",
      maxItems: 12,
      required: true,
      fields: {
        ...navLink,
        children: field.list({ label: "Dropdown links", itemLabel: "Link", titleField: "title", maxItems: 12, fields: navLink }),
      },
    }),
    footerColumns: field.list({
      label: "Footer columns",
      itemLabel: "Column",
      titleField: "title",
      maxItems: 6,
      fields: {
        title: field.text({ label: "Column heading", maxLength: 60, required: true }),
        links: field.list({ label: "Links", itemLabel: "Link", titleField: "title", maxItems: 12, required: true, fields: footerLink }),
      },
    }),
    legalLinks: field.list({
      label: "Legal links (footer bottom row)",
      help: "Leave empty to use the standard legal links.",
      itemLabel: "Link",
      titleField: "title",
      maxItems: 10,
      fields: footerLink,
    }),
  },
});

const about = defineCollection({
  key: "about",
  label: "About page",
  singularLabel: "About page",
  description: "Company background, evolution into Venkat Sai Global, mission, vision, values, leadership and infrastructure.",
  singleton: true,
  defaultSort: "manual",
  consentRequired: false,
  searchable: true,
  usesHero: true,
  publicPath: () => "/about",
  fields: {
    history: field.richtext({ label: "Company background", required: true }),
    evolution: field.richtext({ label: "Evolution into Venkat Sai Global" }),
    mission: field.textarea({ label: "Mission", maxLength: 600, rows: 3 }),
    vision: field.textarea({ label: "Vision", maxLength: 600, rows: 3 }),
    values: titledItems("Values", "Value"),
    capabilities: titledItems("Capabilities", "Capability", "Describe current activities only."),
    infrastructure: field.richtext({ label: "Infrastructure and facilities" }),
    headquarters: field.textarea({ label: "Headquarters", maxLength: 400, rows: 2 }),
    leadershipIds: field.reference({
      label: "Leadership",
      help: "Published team members only (each needs recorded consent).",
      target: { kind: "collection", collection: "team_members" },
      multiple: true,
      maxItems: 12,
    }),
    photoAssetIds: field.assets({ label: "Operational photos", kinds: ["image"], maxItems: 24 }),
  },
});

// ---------------------------------------------------------------------------
// Collections
// ---------------------------------------------------------------------------

const services = defineCollection({
  key: "services",
  label: "Services",
  singularLabel: "Service",
  description: "What Venkat Sai offers: one page per service.",
  singleton: false,
  defaultSort: "manual",
  consentRequired: false,
  searchable: true,
  usesHero: true,
  publicPath: (slug) => `/services/${slug}`,
  fields: {
    overview: field.richtext({ label: "Overview", required: true }),
    whoItHelps: titledItems("Who it helps", "Audience"),
    whatWeProvide: titledItems("What Venkat Sai provides", "Item"),
    processSteps: titledItems("How it works (steps)", "Step"),
    benefits: field.textlist({ label: "Benefits", maxItems: 20 }),
    requirements: field.textlist({ label: "Requirements", help: "What the visitor needs to provide or have.", maxItems: 20 }),
    faqs: faqList(),
    galleryAssetIds: field.assets({ label: "Photos", kinds: ["image", "video", "embed"], maxItems: 24 }),
    enquiryType: field.select({ label: "Enquiry form", options: enquiryTypeOptions, required: true, help: "The contact form shown on the service page." }),
    cta: cta("Call to action"),
    iconName: field.select({ label: "Icon", options: iconOptions }),
    isActive: field.boolean({
      label: "Currently offered",
      defaultValue: true,
      help: "Switch off to keep the page but hide it from service listings and stop new enquiries.",
    }),
    relatedIndustryIds: field.reference({ label: "Related industries", target: { kind: "collection", collection: "industries" }, multiple: true, maxItems: 20 }),
  },
});

const industries = defineCollection({
  key: "industries",
  label: "Industries",
  singularLabel: "Industry",
  description: "Industry pages. Do not claim experience in an industry without evidence.",
  singleton: false,
  defaultSort: "manual",
  consentRequired: false,
  searchable: true,
  usesHero: true,
  publicPath: (slug) => `/industries/${slug}`,
  fields: {
    overview: field.richtext({ label: "Overview", required: true }),
    industryId: field.reference({ label: "Industry (taxonomy)", help: "Links related jobs and courses.", target: { kind: "taxonomy", taxonomy: "industries" } }),
    typicalRoles: field.textlist({ label: "Typical roles", maxItems: 30 }),
    skillsInDemand: field.textlist({ label: "Skills employers commonly ask for", maxItems: 30 }),
    howWeSupport: field.richtext({ label: "How Venkat Sai can support", help: "Describe services you offer today; avoid claims you cannot evidence." }),
    relatedServiceIds: field.reference({ label: "Related services", target: { kind: "collection", collection: "services" }, multiple: true, maxItems: 12 }),
    galleryAssetIds: field.assets({ label: "Photos", kinds: ["image"], maxItems: 12 }),
    iconName: field.select({ label: "Icon", options: iconOptions }),
    cta: cta("Call to action"),
  },
});

const destinations = defineCollection({
  key: "destinations",
  label: "Destinations",
  singularLabel: "Destination",
  description: "Overseas employment country guides (Global Reach). Guidance must be reviewed, sourced and dated.",
  singleton: false,
  defaultSort: "manual",
  consentRequired: false,
  searchable: true,
  usesHero: true,
  categoryField: "region",
  publicPath: (slug) => `/global-reach/${slug}`,
  fields: {
    countryCode: field.country({ label: "Country", required: true }),
    region: field.select({ label: "Region", options: regionOptions, required: true }),
    overview: field.richtext({ label: "Overview" }),
    hiringIndustryIds: field.reference({ label: "Hiring industries", target: { kind: "taxonomy", taxonomy: "industries" }, multiple: true, maxItems: 20 }),
    commonJobCategoryIds: field.reference({ label: "Common job categories", target: { kind: "taxonomy", taxonomy: "job_categories" }, multiple: true, maxItems: 30 }),
    employmentConditions: field.richtext({ label: "Employment conditions" }),
    languageCodes: field.reference({ label: "Languages", target: { kind: "taxonomy", taxonomy: "languages" }, multiple: true, maxItems: 10 }),
    requiredQualifications: field.textlist({ label: "Commonly required qualifications", maxItems: 20 }),
    documentation: field.textlist({ label: "Documentation", help: "Documents candidates are usually asked for.", maxItems: 30 }),
    recruitmentRestrictions: field.richtext({ label: "Recruitment restrictions", help: "For example emigration clearance (ECR) requirements or suspended destinations." }),
    guidance: field.group({
      label: "Employment and immigration guidance",
      help: "Guidance changes often. Every published destination needs a review date, the reviewer, sources and a disclaimer.",
      required: true,
      fields: {
        employmentGuidance: field.richtext({ label: "Employment guidance" }),
        immigrationGuidance: field.richtext({ label: "Immigration and visa guidance" }),
        reviewedAt: field.date({ label: "Last reviewed on", required: true }),
        reviewedBy: field.text({ label: "Reviewed by", maxLength: 160, required: true, help: "Name and role of the person who checked the guidance." }),
        sources: field.list({
          label: "Sources",
          itemLabel: "Source",
          titleField: "title",
          minItems: 1,
          maxItems: 20,
          required: true,
          fields: {
            title: field.text({ label: "Source", maxLength: 200, required: true }),
            url: field.url({ label: "Link", required: true }),
            accessedAt: field.date({ label: "Accessed on" }),
          },
        }),
        disclaimer: field.textarea({
          label: "Disclaimer",
          maxLength: 1_000,
          rows: 3,
          required: true,
          placeholder: "This guidance is general information, not legal or immigration advice. Rules change; confirm with the official sources before acting.",
        }),
      },
    }),
    availableServiceIds: field.reference({ label: "Available services", target: { kind: "collection", collection: "services" }, multiple: true, maxItems: 12 }),
  },
  refine(data, issue) {
    const guidance = asObject(data.guidance);
    if (guidance && isFutureDate(guidance.reviewedAt)) issue(["guidance", "reviewedAt"], "The review date cannot be in the future");
    const sources = Array.isArray(guidance?.sources) ? guidance.sources : [];
    sources.forEach((source, index) => {
      if (isFutureDate(asObject(source)?.accessedAt)) issue(["guidance", "sources", index, "accessedAt"], "The access date cannot be in the future");
    });
  },
});

const caseStudies = defineCollection({
  key: "case_studies",
  label: "Case studies",
  singularLabel: "Case study",
  description: "Success stories. Real, verified engagements only, published with the client's written consent.",
  singleton: false,
  defaultSort: "newest",
  consentRequired: true,
  approvalType: "case_study",
  searchable: true,
  usesHero: true,
  publicPath: (slug) => `/success-stories/${slug}`,
  fields: {
    clientName: field.text({ label: "Client name", maxLength: 160, help: "Only with the client's written consent. Leave empty to anonymise." }),
    clientDescriptor: field.text({ label: "Client description", maxLength: 160, required: true, placeholder: "EPC contractor, Qatar" }),
    industryId: field.reference({ label: "Sector", target: { kind: "taxonomy", taxonomy: "industries" } }),
    countryCode: field.country({ label: "Work location country" }),
    requirement: field.richtext({ label: "The requirement", required: true }),
    positions: field.list({
      label: "Positions",
      itemLabel: "Position",
      titleField: "role",
      maxItems: 40,
      fields: {
        role: field.text({ label: "Role", maxLength: 120, required: true }),
        count: field.number({ label: "Number of positions", integer: true, min: 1, max: 100_000 }),
      },
    }),
    candidateCategories: field.textlist({ label: "Candidate categories", maxItems: 20 }),
    process: titledItems("Process", "Step"),
    assessmentMethod: field.richtext({ label: "Assessment method" }),
    timeline: field.list({
      label: "Timeline",
      itemLabel: "Milestone",
      titleField: "milestone",
      maxItems: 20,
      fields: {
        milestone: field.text({ label: "Milestone", maxLength: 160, required: true }),
        date: field.date({ label: "Date" }),
        description: field.textarea({ label: "Description", maxLength: 600 }),
      },
    }),
    outcome: field.richtext({ label: "Actual outcome", required: true, help: "State only results you can evidence from records." }),
    photoAssetIds: field.assets({ label: "Photos", kinds: ["image"], maxItems: 24 }),
    clientTestimonialId: field.reference({ label: "Client testimonial", target: { kind: "collection", collection: "testimonials" } }),
    candidateTestimonialIds: field.reference({ label: "Candidate testimonials", target: { kind: "collection", collection: "testimonials" }, multiple: true, maxItems: 6 }),
    evidenceNote: field.textarea({
      label: "Evidence (internal)",
      internal: true,
      maxLength: 1_000,
      help: "Where the records behind this case study are kept. Never shown publicly.",
    }),
  },
});

const testimonials = defineCollection({
  key: "testimonials",
  label: "Testimonials",
  singularLabel: "Testimonial",
  description: "Quotes from real people, published only with their recorded consent.",
  singleton: false,
  defaultSort: "manual",
  consentRequired: true,
  approvalType: "testimonial",
  searchable: false,
  usesHero: false,
  categoryField: "type",
  publicPath: () => null,
  fields: {
    quote: field.textarea({ label: "Quote", maxLength: 1_500, rows: 5, required: true, help: "The person's own words, unedited apart from spelling." }),
    personName: field.text({ label: "Name", maxLength: 120, required: true }),
    personRole: field.text({ label: "Role / job title", maxLength: 120 }),
    organisationName: field.text({ label: "Organisation", maxLength: 160 }),
    photoAssetId: field.asset({ label: "Photo", kinds: ["image"] }),
    type: field.select({ label: "Type", options: TESTIMONIAL_TYPE_OPTIONS, required: true }),
    givenOn: field.date({ label: "Date given" }),
    collectedVia: field.textarea({ label: "How it was collected (internal)", internal: true, maxLength: 600 }),
  },
});

const faqs = defineCollection({
  key: "faqs",
  label: "FAQs",
  singularLabel: "FAQ",
  description: "Frequently asked questions. The entry title is the question.",
  singleton: false,
  defaultSort: "manual",
  consentRequired: false,
  searchable: true,
  usesHero: false,
  categoryField: "audience",
  publicPath: () => "/faqs",
  fields: {
    answer: field.richtext({ label: "Answer", required: true, maxLength: 20_000 }),
    audience: field.select({ label: "Audience", options: FAQ_AUDIENCE_OPTIONS, required: true }),
    topic: field.text({ label: "Topic", maxLength: 80, placeholder: "Applications" }),
    relatedServiceIds: field.reference({ label: "Related services", target: { kind: "collection", collection: "services" }, multiple: true, maxItems: 6 }),
  },
});

const news = defineCollection({
  key: "news",
  label: "News",
  singularLabel: "News item",
  description: "News, announcements, company updates, hiring drives and training announcements.",
  singleton: false,
  defaultSort: "newest",
  consentRequired: false,
  searchable: true,
  usesHero: true,
  categoryField: "category",
  publicPath: (slug) => `/news/${slug}`,
  fields: {
    category: field.select({ label: "Category", options: NEWS_CATEGORY_OPTIONS, required: true }),
    body: field.richtext({ label: "Body", required: true }),
    author: field.text({ label: "Author", maxLength: 120 }),
    galleryAssetIds: field.assets({ label: "Photos", kinds: ["image", "video", "embed"], maxItems: 24 }),
    evidenceNote: field.textarea({
      label: "Evidence (internal)",
      internal: true,
      maxLength: 1_000,
      help: "Required for placement announcements: where the placement records can be verified. Name people only with their consent.",
    }),
  },
  refine(data, issue, mode) {
    if (mode === "publish" && data.category === "placement_announcement" && !(typeof data.evidenceNote === "string" && data.evidenceNote.trim())) {
      issue(["evidenceNote"], "Record where this placement can be verified before publishing");
    }
  },
});

const blogPosts = defineCollection({
  key: "blog_posts",
  label: "Blog posts",
  singularLabel: "Blog post",
  description: "Articles and career guidance.",
  singleton: false,
  defaultSort: "newest",
  consentRequired: false,
  searchable: true,
  usesHero: true,
  categoryField: "category",
  publicPath: (slug) => `/blog/${slug}`,
  fields: {
    body: field.richtext({ label: "Body", required: true }),
    author: field.text({ label: "Author", maxLength: 120 }),
    category: field.text({ label: "Category", maxLength: 60, pattern: "^[A-Za-z0-9][A-Za-z0-9 &-]*$", patternMessage: "Letters, numbers, spaces, & and - only" }),
    galleryAssetIds: field.assets({ label: "Images", kinds: ["image", "embed"], maxItems: 24 }),
  },
});

const events = defineCollection({
  key: "events",
  label: "Events",
  singularLabel: "Event",
  description: "Career events, job fairs, hiring drives, webinars and campus drives.",
  singleton: false,
  defaultSort: "event_start",
  consentRequired: false,
  searchable: true,
  usesHero: true,
  categoryField: "eventType",
  publicPath: (slug) => `/events/${slug}`,
  fields: {
    eventType: field.select({ label: "Event type", options: EVENT_TYPE_OPTIONS, required: true }),
    description: field.richtext({ label: "Description", required: true }),
    startsAt: field.datetime({ label: "Starts", required: true }),
    endsAt: field.datetime({ label: "Ends" }),
    timezone: field.text({ label: "Time zone", maxLength: 60, placeholder: "Asia/Kolkata", help: "IANA time zone used to display the schedule." }),
    format: field.select({ label: "Format", options: EVENT_FORMAT_OPTIONS, required: true }),
    venue: field.group({
      label: "Venue",
      fields: {
        name: field.text({ label: "Venue name", maxLength: 160 }),
        address: field.textarea({ label: "Address", maxLength: 500, rows: 2 }),
        city: field.text({ label: "City", maxLength: 80 }),
        countryCode: field.country({ label: "Country" }),
        mapUrl: field.url({ label: "Map link" }),
      },
    }),
    onlineUrl: field.url({ label: "Online joining link", help: "Shown publicly. Use the registration link instead if the joining link is private." }),
    registration: field.group({
      label: "Registration",
      fields: {
        required: field.boolean({ label: "Registration required", defaultValue: false }),
        url: field.url({ label: "Registration link", allowRelative: true }),
        deadline: field.datetime({ label: "Registration closes" }),
        instructions: field.textarea({ label: "Instructions", maxLength: 1_000, rows: 3, help: "Never ask candidates to pay to register for a hiring event." }),
      },
    }),
    organiserName: field.text({ label: "Organiser", maxLength: 160 }),
    galleryAssetIds: field.assets({ label: "Photos", kinds: ["image", "video", "embed"], maxItems: 24 }),
  },
  refine(data, issue, mode) {
    const start = typeof data.startsAt === "string" ? Date.parse(data.startsAt) : Number.NaN;
    const end = typeof data.endsAt === "string" ? Date.parse(data.endsAt) : Number.NaN;
    if (!Number.isNaN(start) && !Number.isNaN(end) && end <= start) issue(["endsAt"], "The end must be after the start");
    if (typeof data.timezone === "string" && data.timezone.trim()) {
      try {
        new Intl.DateTimeFormat("en", { timeZone: data.timezone.trim() });
      } catch {
        issue(["timezone"], "Enter a valid time zone such as Asia/Kolkata");
      }
    }
    const registration = asObject(data.registration);
    const deadline = typeof registration?.deadline === "string" ? Date.parse(registration.deadline) : Number.NaN;
    const latest = Number.isNaN(end) ? start : end;
    if (!Number.isNaN(deadline) && !Number.isNaN(latest) && deadline > latest) issue(["registration", "deadline"], "Registration must close before the event ends");
    if (mode !== "publish") return;
    const venue = asObject(data.venue);
    if ((data.format === "in_person" || data.format === "hybrid") && !(venue?.name && venue?.city)) {
      issue(["venue", "name"], "Add the venue name and city for an in-person event");
    }
    if ((data.format === "online" || data.format === "hybrid") && !data.onlineUrl && !registration?.url) {
      issue(["onlineUrl"], "Add the joining link or a registration link for an online event");
    }
    if (registration?.required === true && !registration.url) issue(["registration", "url"], "Add the registration link");
  },
});

const galleryAlbums = defineCollection({
  key: "gallery_albums",
  label: "Gallery albums",
  singularLabel: "Gallery album",
  description: "Photo and video albums. Photos of identifiable people appear only once their consent is recorded on the media item.",
  singleton: false,
  defaultSort: "newest",
  consentRequired: false,
  searchable: true,
  usesHero: true,
  publicPath: (slug) => `/gallery/${slug}`,
  fields: {
    description: field.textarea({ label: "Description", maxLength: 2_000, rows: 4 }),
    assetIds: field.assets({ label: "Photos and videos", kinds: ["image", "video", "embed"], maxItems: 60, required: true }),
    eventDate: field.date({ label: "Date" }),
    location: field.text({ label: "Location", maxLength: 160 }),
    relatedEventId: field.reference({ label: "Related event", target: { kind: "collection", collection: "events" } }),
  },
});

const videos = defineCollection({
  key: "videos",
  label: "Videos",
  singularLabel: "Video",
  description: "YouTube and Vimeo videos (embed links only; nothing is uploaded).",
  singleton: false,
  defaultSort: "newest",
  consentRequired: false,
  searchable: true,
  usesHero: true,
  categoryField: "category",
  publicPath: (slug) => `/videos/${slug}`,
  fields: {
    embedUrl: field.url({ label: "YouTube or Vimeo link", urlKind: "video", required: true }),
    description: field.textarea({ label: "Description", maxLength: 2_000, rows: 4 }),
    transcript: field.richtext({ label: "Transcript", help: "A transcript or captions help people who cannot hear the audio (WCAG 1.2)." }),
    captionsAvailable: field.boolean({ label: "The video has captions", defaultValue: false }),
    category: field.text({ label: "Category", maxLength: 60 }),
    consentNote: field.textarea({
      label: "People shown (internal)",
      internal: true,
      maxLength: 600,
      help: "If identifiable people appear, note where their consent is recorded.",
    }),
  },
});

const pages = defineCollection({
  key: "pages",
  label: "Pages",
  singularLabel: "Page",
  description: "Legal and static pages (privacy policy, terms, cookie policy, data rights, accessibility, grievance redressal, disclaimers, careers).",
  singleton: false,
  defaultSort: "manual",
  consentRequired: false,
  searchable: true,
  usesHero: false,
  categoryField: "pageType",
  publicPath: (slug) => LEGAL_PAGE_PATHS[slug] ?? `/${slug}`,
  fields: {
    pageType: field.select({ label: "Page type", options: PAGE_TYPE_OPTIONS, required: true }),
    body: field.richtext({ label: "Body", required: true }),
    version: field.text({ label: "Version", maxLength: 40, required: true, pattern: "^[0-9A-Za-z][0-9A-Za-z.-]*$", placeholder: "2026-11-01" }),
    effectiveDate: field.date({ label: "Effective from", required: true }),
    summaryOfChanges: field.textarea({ label: "What changed in this version", maxLength: 1_500, rows: 3 }),
    showTableOfContents: field.boolean({ label: "Show a table of contents", defaultValue: true }),
    internalNote: field.textarea({ label: "Internal note", internal: true, maxLength: 1_500, help: "Review status and notes for the team. Never shown publicly." }),
  },
});

const teamMembers = defineCollection({
  key: "team_members",
  label: "Team members",
  singularLabel: "Team member",
  description: "People shown on the website (entry title = name). Each needs recorded consent before publishing.",
  singleton: false,
  defaultSort: "manual",
  consentRequired: true,
  searchable: false,
  usesHero: false,
  categoryField: "group",
  publicPath: () => "/about",
  fields: {
    role: field.text({ label: "Role", maxLength: 120, required: true }),
    group: field.select({ label: "Group", options: TEAM_GROUP_OPTIONS, required: true }),
    bio: field.textarea({ label: "Short biography", maxLength: 1_500, rows: 4 }),
    photoAssetId: field.asset({ label: "Photo", kinds: ["image"] }),
    linkedinUrl: field.url({ label: "LinkedIn profile" }),
  },
});

const clientLogos = defineCollection({
  key: "client_logos",
  label: "Client logos",
  singularLabel: "Client logo",
  description: "Logos shown only while an approved logo permission covers the location.",
  singleton: false,
  defaultSort: "manual",
  consentRequired: false,
  searchable: false,
  usesHero: false,
  publicPath: () => null,
  fields: {
    logoAssetId: field.asset({ label: "Logo", kinds: ["image"], required: true }),
    websiteUrl: field.url({ label: "Website", help: "Leave empty if the permission does not allow linking." }),
  },
});

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const COLLECTIONS = {
  services,
  industries,
  destinations,
  case_studies: caseStudies,
  testimonials,
  faqs,
  news,
  blog_posts: blogPosts,
  events,
  gallery_albums: galleryAlbums,
  videos,
  pages,
  team_members: teamMembers,
  client_logos: clientLogos,
  site_settings: siteSettings,
  homepage,
  navigation,
  about,
} as const satisfies { readonly [K in CmsCollection]: CollectionDefinition };

export type Collections = typeof COLLECTIONS;

/** Typed entry data of a collection (as validated for publication). */
export type CollectionData<K extends CmsCollection> = DataOf<Collections[K]["fields"]>;

export type SiteSettingsData = CollectionData<"site_settings">;
export type HomepageData = CollectionData<"homepage">;
export type NavigationData = CollectionData<"navigation">;
export type AboutData = CollectionData<"about">;
export type ServiceData = CollectionData<"services">;
export type IndustryData = CollectionData<"industries">;
export type DestinationData = CollectionData<"destinations">;
export type CaseStudyData = CollectionData<"case_studies">;
export type TestimonialData = CollectionData<"testimonials">;
export type FaqData = CollectionData<"faqs">;
export type NewsData = CollectionData<"news">;
export type BlogPostData = CollectionData<"blog_posts">;
export type EventData = CollectionData<"events">;
export type GalleryAlbumData = CollectionData<"gallery_albums">;
export type VideoData = CollectionData<"videos">;
export type PageData = CollectionData<"pages">;
export type TeamMemberData = CollectionData<"team_members">;
export type ClientLogoData = CollectionData<"client_logos">;

export function getCollection(key: CmsCollection): CollectionDefinition {
  return COLLECTIONS[key];
}

export function isCmsCollection(value: unknown): value is CmsCollection {
  return typeof value === "string" && (CMS_COLLECTION_VALUES as readonly string[]).includes(value);
}

/** The fixed slug of a singleton, or null for regular collections. */
export function fixedSlugFor(collection: CmsCollection): string | null {
  return isSingletonCollection(collection) ? singletonSlug(collection as CmsSingletonCollection) : null;
}

/** Public path of an entry, or null when the collection has no page per entry. */
export function publicPathFor(collection: CmsCollection, slug: string): string | null {
  return COLLECTIONS[collection].publicPath(slug);
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export type DataValidationResult = { ok: true; data: Json } | { ok: false; fieldErrors: Record<string, string[]> };

const schemaCache = new Map<string, z.ZodType<Json>>();

/** The zod schema of a collection's data in a mode (field rules + collection refinements). Cached. */
export function collectionDataSchema(collection: CmsCollection, mode: SchemaMode, opts: { omitInternal?: boolean } = {}): z.ZodType<Json> {
  const cacheKey = `${collection}:${mode}:${opts.omitInternal ? 1 : 0}`;
  const cached = schemaCache.get(cacheKey);
  if (cached) return cached;
  const definition = getCollection(collection);
  const base = buildObjectSchema(definition.fields, mode, opts);
  const schema = definition.refine
    ? base.superRefine((data, ctx) => {
        definition.refine!(data, (path, message) => ctx.addIssue({ code: "custom", path, message }), mode);
      })
    : base;
  schemaCache.set(cacheKey, schema);
  return schema;
}

/**
 * Validate (and normalise) entry data. Field errors are keyed "data.<path>" so forms can show them next to
 * the generic editor's inputs (`data.faqs.0.answer`).
 */
export function validateCollectionData(collection: CmsCollection, data: unknown, mode: SchemaMode): DataValidationResult {
  const parsed = collectionDataSchema(collection, mode).safeParse(data ?? {});
  if (parsed.success) return { ok: true, data: dropUndefined(parsed.data) };
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of parsed.error.issues) {
    const key = ["data", ...issue.path.map(String)].join(".");
    (fieldErrors[key] ??= []).push(issue.message);
  }
  return { ok: false, fieldErrors };
}

// ---------------------------------------------------------------------------
// Editor descriptors
// ---------------------------------------------------------------------------

export type CollectionDescriptor = {
  key: CmsCollection;
  label: string;
  singularLabel: string;
  description: string;
  singleton: boolean;
  fixedSlug: string | null;
  categoryField: string | null;
  defaultSort: CollectionSort;
  consentRequired: boolean;
  approvalType: "testimonial" | "case_study" | null;
  usesHero: boolean;
  /** Example public path ("/services/<slug>") or null. */
  publicPathPattern: string | null;
  fields: SerializedField[];
};

/** Everything the generic admin editor needs to render a collection (plain JSON). */
export function describeCollection(collection: CmsCollection): CollectionDescriptor {
  const d = getCollection(collection);
  return {
    key: d.key,
    label: d.label,
    singularLabel: d.singularLabel,
    description: d.description,
    singleton: d.singleton,
    fixedSlug: fixedSlugFor(collection),
    categoryField: d.categoryField ?? null,
    defaultSort: d.defaultSort,
    consentRequired: d.consentRequired,
    approvalType: d.approvalType ?? null,
    usesHero: d.usesHero,
    publicPathPattern: d.publicPath("<slug>"),
    fields: serializeFields(d.fields),
  };
}

/** Descriptors of every collection, singletons last (admin navigation). */
export function describeAllCollections(): CollectionDescriptor[] {
  return [...CMS_COLLECTION_VALUES].sort((a, b) => Number(isSingletonCollection(a)) - Number(isSingletonCollection(b))).map(describeCollection);
}
