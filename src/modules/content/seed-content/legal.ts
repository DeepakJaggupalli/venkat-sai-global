import { BRAND } from "@/config/site";

import type { SeedEntrySpec } from "./types";

/**
 * Legal pages, published at launch with version 2026-11-01 (matching the privacy.policy_version and
 * privacy.terms_version settings). Written from docs/research/regulatory-notes.md in plain language. They are a
 * starting point only: every page carries an internal note that review by qualified counsel is required.
 * Timelines that are settings (grievance acknowledgement / resolution, data request response) are not written
 * into the text; the grievance and data-rights pages show the configured values alongside this copy.
 */

export const LEGAL_VERSION = "2026-11-01";

const INTERNAL_NOTE =
  "Initial version prepared from the regulatory research notes (docs/research/regulatory-notes.md). It has NOT been reviewed by a lawyer: qualified legal counsel must review and approve this text before the business relies on it.";

const ENTITY = BRAND.legalEntity;
const HQ = BRAND.headquarters;

const h2 = (text: string) => `<h2>${text}</h2>`;
const p = (text: string) => `<p>${text}</p>`;
const ul = (items: readonly string[]) => `<ul>${items.map((i) => `<li>${i}</li>`).join("")}</ul>`;

const PRIVACY = [
  p(`This privacy policy explains how ${ENTITY} ("Venkat Sai", "we", "us"), which operates ${BRAND.name}, collects, uses, shares and protects personal data, and the choices and rights you have. It is written with the Digital Personal Data Protection Act, 2023 and the rules made under it in mind.`),
  h2("Who we are"),
  p(`${ENTITY} is based in ${HQ}. For the personal data described here, we decide why and how it is processed (we are the "data fiduciary"). Our contact details and the details of our grievance officer are shown on the <a href="/grievance">grievance redressal</a> page.`),
  h2("The personal data we collect"),
  ul([
    "<strong>Account data</strong>: your name, email address, mobile number, password (stored only as a secure hash), language and time zone.",
    "<strong>Profile data</strong> (candidates): headline, experience, education, skills, languages, work preferences, expected salary, location, availability, and, if you choose to add them, your photo, date of birth, passport status and documents.",
    "<strong>Application data</strong>: the jobs you apply for, your answers to screening questions, interviews, assessments, offers and placement progress.",
    "<strong>Organisation data</strong> (employers, recruitment partners, institutions): organisation details, verification documents and the names and contact details of team members.",
    "<strong>Communications</strong>: messages, enquiries, support requests and grievances you send us.",
    "<strong>Technical data</strong>: device and browser information, and security logs such as sign-in records. IP addresses are stored only in a pseudonymised (hashed) form.",
    "<strong>Analytics data</strong>: how the website is used, collected only if you allow analytics cookies. See the <a href=\"/legal/cookie-policy\">cookie policy</a>.",
  ]),
  h2("Why we use it"),
  ul([
    "To create and secure your account and keep you signed in.",
    "To show you relevant jobs and training, and to process your applications.",
    "To share your profile and selected documents with an employer when you apply to their job or give your consent.",
    "To let recruitment partners submit candidates who have given their consent.",
    "To arrange interviews, trade tests, training, assessments and certificates.",
    "To verify organisations, documents and credentials.",
    "To send you service messages and, only if you opt in, marketing messages.",
    "To prevent fraud, protect our users and keep the platform secure.",
    "To meet our legal obligations.",
    "To understand and improve the website, only with your consent.",
  ]),
  h2("Consent and how to withdraw it"),
  p("We ask for your consent separately for each optional purpose (for example sharing your profile with employers, overseas processing, marketing messages and analytics). You can withdraw any consent as easily as you gave it, from the privacy section of the People Portal or your account settings. Withdrawing consent does not affect processing that happened before, but we will stop the processing and ask our service providers to stop it within a reasonable time."),
  h2("Who we share it with"),
  ul([
    "<strong>Employers</strong> you apply to, or that you allow to see your profile.",
    "<strong>Recruitment partners</strong> and <strong>training institutions</strong> involved in your application or training, only as far as needed.",
    "<strong>Service providers</strong> that host the platform or send emails, text messages and WhatsApp messages for us, under contracts that require them to protect your data.",
    "<strong>Authorities</strong>, when the law requires it.",
  ]),
  p("We do not sell personal data."),
  h2("Overseas employers"),
  p("If you apply for a job abroad, your details are shared with an employer outside India. We ask for your consent to overseas processing first, and we keep a record of the countries your data is shared with."),
  h2("How long we keep it"),
  p("We keep personal data while your account is active and for as long as needed for the purpose it was collected for. Some records must be kept for longer by law (for example tax, employment and security records). Logs of processing are kept for at least one year, as the data protection rules require. When data is no longer needed, we delete or anonymise it."),
  h2("How we protect it"),
  p("We use encryption, access controls, masking of contact details, logging of access to sensitive data, and regular backups. Only people who need personal data for their work can see it."),
  h2("Children"),
  p(`${BRAND.name} is for people aged 18 or over. A person under 18 may use limited features only with the verifiable consent of a parent or lawful guardian. We do not track, profile or send marketing to children, and children are not considered for overseas roles.`),
  h2("Your rights"),
  p("You can ask for information about how your data is processed, and ask us to correct, complete, update or erase it. You can also nominate someone to exercise your rights if you are unable to, and raise a grievance. The <a href=\"/legal/data-rights\">data rights</a> page explains how."),
  h2("Complaints"),
  p("If you are not satisfied with how we handle your personal data, contact our grievance officer (see the <a href=\"/grievance\">grievance redressal</a> page). If you are still not satisfied after our response, you may complain to the Data Protection Board of India."),
  h2("Changes to this policy"),
  p("When we change this policy we publish the new version with its effective date, and tell you about important changes before they take effect."),
].join("");

const TERMS = [
  p(`These terms of service apply to everyone who uses ${BRAND.name}, operated by ${ENTITY}, ${HQ}. By creating an account or using the platform you agree to them. Please read them together with our <a href="/legal/privacy-policy">privacy policy</a>.`),
  h2("Who can use the platform"),
  p("You must be 18 or over. A person under 18 may use limited features only with the verifiable consent of a parent or lawful guardian. Organisations must be lawfully registered and represented by someone authorised to act for them."),
  h2("Your account"),
  p("Keep your sign-in details secure and tell us at once if you think someone else has used your account. You are responsible for the information you provide: it must be accurate and up to date."),
  h2("No fees for candidates"),
  p("Candidates are never charged to discover, apply for, be submitted for, be interviewed for or be trade-tested for a job through the platform. Employers, recruitment partners and anyone else using the platform must not ask candidates for any payment in connection with a job. Paid training is always optional and is never a condition of an application, offer or placement."),
  h2("Employers"),
  ul([
    "Job listings must describe real vacancies accurately, including pay, location and working conditions.",
    "Jobs are published only after your organisation has been verified, and may be reviewed before they go live.",
    "You must comply with the law that applies to your hiring, including the emigration and labour laws for overseas and contract recruitment.",
    "Candidate details you receive may be used only for the recruitment they were shared for.",
  ]),
  h2("Recruitment partners"),
  ul([
    "You must hold every registration the law requires for your activities, including an eMigrate registration for overseas recruitment.",
    "You may submit a candidate only with that candidate's informed consent.",
    "You must not charge candidates any fee.",
  ]),
  h2("What you must not do"),
  ul([
    "Post fake, misleading or unlawful jobs, or ask anyone for money for a job.",
    "Impersonate anyone, or upload content that is false, deceptive or synthetically generated to mislead.",
    "Collect data from the platform by automated means, or try to break its security.",
    "Harass, abuse or discriminate against anyone.",
    "Upload content you do not have the right to share.",
  ]),
  p("You can report any job, profile or message that breaks these rules. We may remove content and suspend accounts that break them."),
  h2("No guarantees"),
  p("We work to connect people with suitable opportunities, but we do not guarantee any job, interview, offer, placement, visa or work permit. Employers make their own hiring decisions, and visas and permits are decided by the authorities of each country."),
  h2("Assessments and certificates"),
  p("Results of Venkat Sai trade and skill tests are labelled as Venkat Sai assessments with the procedure used. They are not accredited external certifications unless the certificate says so. Certificates can be checked at <a href=\"/verify-certificate\">/verify-certificate</a>."),
  h2("Business services and fees"),
  p("Fees for services to employers, recruitment partners and institutions are set out in the plan, quotation or agreement you accept. Prices, taxes and currencies are shown before you pay."),
  h2("Content and intellectual property"),
  p(`The platform, its design and the ${BRAND.name} name belong to ${ENTITY}. You keep ownership of the content you upload, and give us permission to use it to provide the services you asked for.`),
  h2("Liability"),
  p("We provide the platform with reasonable care and skill. To the extent the law allows, we are not responsible for decisions made by employers, candidates or partners, or for losses that we could not reasonably foresee. Nothing in these terms limits liability that cannot be limited by law."),
  h2("Suspension and closing your account"),
  p("You can close your account at any time. We may suspend or close accounts that break these terms or the law, and will tell you why unless the law prevents us."),
  h2("Law and disputes"),
  p("These terms are governed by the laws of India. Please contact our grievance officer first so we can try to resolve any problem."),
  h2("Changes"),
  p("When we change these terms we publish the new version with its effective date and tell you about important changes in advance."),
].join("");

const COOKIES = [
  p(`This cookie policy explains the cookies and similar technologies ${BRAND.name} uses and how you can control them. You can change your choices at any time on the <a href="/cookie-preferences">cookie preferences</a> page.`),
  h2("Strictly necessary"),
  p("These keep the website working and secure: they keep you signed in, protect forms against misuse and remember security settings. They cannot be switched off, and they do not track you for analytics or advertising."),
  h2("Functional"),
  p("These remember choices that make the site easier to use, such as your language and whether you dismissed a notice. They are used only if you allow functional cookies."),
  h2("Analytics"),
  p("If you allow analytics cookies, we record how pages are used (for example which pages are visited and how people move between them) with a random, pseudonymous identifier. We do not record what you type into forms. If an external analytics service is enabled, it is used only with this consent."),
  h2("Session insights"),
  p("If you allow session insights, we may use a tool that shows how pages are used, with text and form contents masked. It is never used without this separate consent."),
  h2("Children"),
  p("Analytics and session insights are never used for people under 18."),
  h2("How long cookies last"),
  p("Session cookies end when you close your browser or sign out. Other cookies last for the period shown in your browser, and analytics data is kept only for the period in our retention schedule."),
  h2("Changing your choices"),
  p("You can withdraw or change your consent at any time on the <a href=\"/cookie-preferences\">cookie preferences</a> page, and you can also delete cookies in your browser settings."),
].join("");

const DATA_RIGHTS = [
  p("Under India's data protection law you have rights over your personal data. This page explains them and how to use them."),
  h2("Your rights"),
  ul([
    "<strong>Information</strong>: ask what personal data we process about you, why, and who we have shared it with.",
    "<strong>Correction, completion and updating</strong>: ask us to fix inaccurate or incomplete data.",
    "<strong>Erasure</strong>: ask us to delete data we no longer need, unless the law requires us to keep it.",
    "<strong>Withdrawing consent</strong>: withdraw any consent you gave, as easily as you gave it.",
    "<strong>Nomination</strong>: nominate a person to exercise your rights if you die or become unable to do so.",
    "<strong>Grievance redressal</strong>: complain to us, and then to the Data Protection Board of India if you are not satisfied.",
  ]),
  h2("How to make a request"),
  ul([
    "If you have an account, use the privacy section of the People Portal or your account settings. You can download your data, correct it, withdraw consents and ask for your account to be closed there.",
    "If you do not have an account, or cannot sign in, contact our grievance officer using the details on the <a href=\"/grievance\">grievance redressal</a> page.",
  ]),
  p("To protect you, we may ask you to confirm your identity before we act on a request."),
  h2("What happens next"),
  p("We acknowledge your request and respond within the response period shown on this page. If we cannot do what you ask, for example because the law requires us to keep certain records, we explain why. Every response includes the details of the person you can contact with questions."),
].join("");

const ACCESSIBILITY = [
  p(`We want ${BRAND.name} to be usable by everyone, including people who use assistive technologies.`),
  h2("Our target"),
  p("We aim to meet the Web Content Accessibility Guidelines (WCAG) 2.2 at level AA across the website and the portals."),
  h2("What we do"),
  ul([
    "Pages can be used with a keyboard, with a visible focus indicator and a link to skip to the main content.",
    "Text and controls are designed to meet colour contrast requirements, and colour is never the only way information is shown.",
    "Images have text alternatives, and form fields have labels and clear error messages.",
    "The People Portal is available in English, Hindi and Telugu.",
    "Animations are reduced when your device asks for reduced motion.",
  ]),
  h2("Known limitations"),
  p("We are still testing the platform. Some content, such as documents uploaded by organisations and videos hosted by third parties, may not be fully accessible. Where a video has no captions, we try to provide a transcript."),
  h2("Feedback"),
  p("If you find something you cannot use, please tell us through the contact page, saying which page and what went wrong. We will try to fix it, or give you the information another way."),
].join("");

const GRIEVANCE = [
  p(`You can raise a grievance with ${ENTITY} about ${BRAND.name}: for example about content on the platform, how your personal data is handled, the conduct of another user, or anyone asking you for money for a job.`),
  h2("Grievance officer"),
  p("The name and contact details of our grievance officer are shown on this page. You can also raise a grievance from the support section of your portal."),
  h2("What to include"),
  ul(["Your name and how to contact you.", "What happened, with links or screenshots if you have them.", "What you would like us to do."]),
  h2("Timelines"),
  p("We acknowledge every grievance and resolve it within the timelines required by the Information Technology Rules and the data protection law. The current timelines are shown on this page. Some complaints, such as content that impersonates someone or shows intimate images, are acted on much faster."),
  h2("If you are not satisfied"),
  ul([
    "For complaints about content and user conduct, you may appeal to the Grievance Appellate Committee set up under the Information Technology Rules.",
    "For complaints about personal data, you may complain to the Data Protection Board of India.",
  ]),
  h2("Fraud and fee demands"),
  p("Candidates never pay to apply for or be considered for a job through Venkat Sai Global. If anyone asks you for money for a job, do not pay and report it to us. Workers going abroad can also check a recruiting agent's registration on the Government of India's eMigrate portal and contact the Pravasi Bharatiya Sahayata Kendra (the government's helpline for overseas workers) through the Ministry of External Affairs."),
].join("");

const DISCLAIMERS = [
  h2("No guarantee of jobs, visas or placements"),
  p("Venkat Sai works to connect people with suitable opportunities, but does not guarantee any job, interview, offer, placement, visa or work permit. Employers decide whom to hire, and visas and permits are decided by the authorities of each country."),
  h2("Candidates never pay to apply"),
  p("Candidates are never charged to discover, apply for, be submitted for, be interviewed for or be trade-tested for a job through Venkat Sai Global. Anyone asking for money for a job is not acting for Venkat Sai. Please report them to us."),
  h2("Job listings"),
  p("Job details are provided by employers. Jobs are published only for verified organisations, and job pages show which details were checked by Venkat Sai and which were supplied by the employer."),
  h2("Destination guidance"),
  p("Information about working in other countries is general guidance, not legal or immigration advice. Rules change often: always check the current requirements with the official sources named on each page."),
  h2("Assessments and certificates"),
  p("Venkat Sai trade and skill test results are Venkat Sai assessments. They are not accredited external certifications unless the certificate says so."),
  h2("Public statistics"),
  p("Figures shown on the website are counted from records on the platform, or are figures approved by Venkat Sai with the date they refer to. Each figure explains what it counts."),
  h2("Links to other websites"),
  p("Links to other websites are provided for convenience. Venkat Sai is not responsible for their content."),
].join("");

type LegalPage = { slug: string; title: string; summary: string; body: string; seoDescription: string };

const LEGAL_PAGES: readonly LegalPage[] = [
  { slug: "privacy-policy", title: "Privacy policy", summary: "How we collect, use, share and protect personal data, and your choices and rights.", body: PRIVACY, seoDescription: "How Venkat Sai Global collects, uses and protects personal data." },
  { slug: "terms", title: "Terms of service", summary: "The rules for using Venkat Sai Global.", body: TERMS, seoDescription: "The terms that apply to everyone who uses Venkat Sai Global." },
  { slug: "cookie-policy", title: "Cookie policy", summary: "The cookies we use and how to control them.", body: COOKIES, seoDescription: "The cookies Venkat Sai Global uses and how to manage your choices." },
  { slug: "data-rights", title: "Your data rights", summary: "Your rights over your personal data and how to use them.", body: DATA_RIGHTS, seoDescription: "How to access, correct or erase your personal data on Venkat Sai Global." },
  { slug: "accessibility", title: "Accessibility statement", summary: "Our accessibility target (WCAG 2.2 AA) and how to give feedback.", body: ACCESSIBILITY, seoDescription: "Accessibility of Venkat Sai Global." },
  { slug: "grievance-redressal", title: "Grievance redressal", summary: "How to raise a grievance and what happens next.", body: GRIEVANCE, seoDescription: "How to raise a grievance with Venkat Sai Global." },
  { slug: "disclaimers", title: "Disclaimers", summary: "What Venkat Sai Global does and does not promise.", body: DISCLAIMERS, seoDescription: "Important disclaimers about jobs, visas, assessments and guidance on Venkat Sai Global." },
];

export function buildLegalPageSeeds(): SeedEntrySpec[] {
  return LEGAL_PAGES.map((page, index) => ({
    collection: "pages",
    slug: page.slug,
    title: page.title,
    summary: page.summary,
    sortOrder: (index + 1) * 10,
    seo: { description: page.seoDescription },
    publish: true,
    note: `Version ${LEGAL_VERSION}. Legal review required.`,
    data: {
      pageType: "legal",
      body: page.body,
      version: LEGAL_VERSION,
      effectiveDate: LEGAL_VERSION,
      summaryOfChanges: "First version.",
      showTableOfContents: true,
      internalNote: INTERNAL_NOTE,
    },
  }));
}
