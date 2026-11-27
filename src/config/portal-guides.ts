/**
 * "How to use" guides for every portal (client-safe data). The dashboard <HowToUse> card shows `quickSteps`;
 * the portal help pages (/admin/help, /talent/help, /employer/help, /agency/help, /recruiter/help,
 * /institution/help) show `sections` and `faqs`. Plain, short English: the owner and staff read this on a phone.
 *
 * Rules:
 * - Every href must be a real route (portal-guides.test.ts checks them against src/app). /agency/… is served by
 *   the /employer routes through the proxy rewrite.
 * - `permission` (one key, or several meaning "any of") hides a step or section from viewers whose role cannot
 *   use it, the same way the sidebar hides menu items. Items without one show to everyone in the portal.
 * - Never put numbers, fees or promises here that the product does not enforce.
 */
import {
  Award,
  BadgeCheck,
  Bell,
  BookOpen,
  Briefcase,
  Building2,
  CalendarCheck2,
  CalendarClock,
  ClipboardCheck,
  ClipboardList,
  Coins,
  Compass,
  CreditCard,
  FileText,
  FileUser,
  Gauge,
  Gift,
  GraduationCap,
  HardHat,
  Headset,
  Inbox,
  KanbanSquare,
  ListChecks,
  Megaphone,
  MessageSquare,
  Newspaper,
  Plane,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Target,
  UserCircle,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import { PORTAL_HELP_HREF } from "@/components/layout/portal-help";
import type { PortalKey } from "@/config/navigation";

export type GuidePortalKey = PortalKey;

export type GuidePermission = string | readonly string[];

/**
 * A link under a section. `permission` (same rule as sections) hides the link when the section is shown for another
 * permission than the one its page needs (e.g. "Post a job" in a section shown to everyone with requirements.view).
 */
export type GuideLink = { label: string; href: string; permission?: GuidePermission };

export type GuideQuickStep = {
  title: string;
  /** One short line. */
  description: string;
  href: string;
  icon: LucideIcon;
  permission?: GuidePermission;
};

export type GuideFaq = { question: string; answer: string };

export type GuideSection = {
  /** Anchor id on the help page (lowercase, dashes). */
  id: string;
  topic: string;
  /** One sentence: what this area is for. */
  summary: string;
  icon: LucideIcon;
  /** Plain-English steps, in order. */
  steps: readonly string[];
  links: readonly GuideLink[];
  faqs?: readonly GuideFaq[];
  permission?: GuidePermission;
};

export type PortalGuide = {
  portal: GuidePortalKey;
  /** Help page heading. */
  title: string;
  /** One or two sentences under the heading. */
  intro: string;
  /** Example word for the help page search box ("invoice"). */
  searchExample: string;
  quickSteps: readonly GuideQuickStep[];
  sections: readonly GuideSection[];
  faqs: readonly GuideFaq[];
};

export { PORTAL_HELP_HREF };

// ---------------------------------------------------------------------------
// Command Centre (owner and staff)
// ---------------------------------------------------------------------------

const ADMIN: PortalGuide = {
  portal: "admin",
  title: "How to use the Command Centre",
  intro:
    "Everything the office does, in one place: requirements, applicants, approvals, companies, training and money. You only see the areas your role allows.",
  searchExample: "invoice",
  quickSteps: [
    {
      title: "Post a requirement from your phone",
      description: "Choose the poster photo, pick the country and trades, then publish.",
      href: "/admin/requirements/posters/new",
      icon: Megaphone,
      // The page needs content.edit and media.manage (content.view alone opens only the posters list).
      permission: "content.edit",
    },
    {
      title: "Call back new applicants",
      description: "Open Applicants and CVs, call or WhatsApp, then set the status.",
      href: "/admin/cv-submissions",
      icon: FileUser,
      permission: "candidates.view",
    },
    {
      title: "Clear the approval centre",
      description: "Verifications, jobs and requirements wait here for a decision.",
      href: "/admin/approvals",
      icon: ListChecks,
      permission: "approvals.view",
    },
    {
      title: "Move candidates forward",
      description: "The pipeline shows every application by stage.",
      href: "/admin/pipeline",
      icon: KanbanSquare,
      permission: "recruitment.view",
    },
    { title: "Check your tasks", description: "Your work items and reminders for today.", href: "/admin/tasks", icon: ClipboardCheck },
    {
      title: "Answer support requests",
      description: "Reply to people who asked for help, before the deadline.",
      href: "/admin/support",
      icon: Headset,
      permission: "support.view",
    },
  ],
  sections: [
    {
      id: "getting-around",
      topic: "Find your way around",
      summary: "The menu, the dashboard, notifications and your own account.",
      icon: Compass,
      steps: [
        "On a phone, tap the menu button (three lines) at the top left to open the menu. On a computer the menu is on the left.",
        "The dashboard shows today's real numbers. Tap a number to open the list behind it.",
        "The bell shows new notifications. Tap one to open it.",
        "Tap the ? button at the top any time to come back to this guide.",
        "Install the website as an app on Android: open it in Chrome, tap ⋮, then Install app.",
      ],
      links: [
        { label: "Dashboard", href: "/admin" },
        { label: "My tasks", href: "/admin/tasks" },
        { label: "Notifications", href: "/account/notifications" },
        { label: "Account security", href: "/account/security" },
      ],
    },
    {
      id: "posters",
      topic: "Requirement posters",
      summary: "Put a job requirement on the website straight from a phone.",
      icon: Megaphone,
      permission: "content.view",
      steps: [
        "Open Post requirement, or share a poster photo from Gallery or WhatsApp to the installed app.",
        "Pick the country and type the trades, one per line, with the salary after a dash (for example: Mechanical helper - 900 AED).",
        "Tap Publish now. Without publish rights the poster goes to the approval centre first.",
        "Each poster has an Applicants button: see everyone who applied, call or WhatsApp them, and download Excel.",
        "Archive a poster when the requirement is closed. It leaves the website but stays in your records.",
      ],
      links: [
        { label: "Post a requirement", href: "/admin/requirements/posters/new", permission: "content.edit" },
        { label: "All posters", href: "/admin/requirements/posters" },
      ],
      faqs: [
        {
          question: "A poster shows people's faces. Can I post it?",
          answer: "Only through the media library, where their consent is recorded. Do not use the quick poster page for it.",
        },
      ],
    },
    {
      id: "applicants",
      topic: "Applicants and CVs",
      summary: "Every CV sent from the website, a poster or a phone share lands here.",
      icon: FileUser,
      permission: "candidates.view",
      steps: [
        "Open Applicants and CVs. Newest come first; filter by status, trade, country or requirement.",
        "Tap Call or WhatsApp to reach the person. These buttons are logged.",
        "Set the status: New, Contacted, Shortlisted or Not suitable.",
        "Open a person to add staff remarks, add documents, or send them an upload link for their documents.",
        "Download the CV pack or visa pack as one PDF, or the list as Excel.",
        "Already keep CVs in Excel? Use Import from Excel to add them.",
      ],
      links: [
        { label: "Applicants and CVs", href: "/admin/cv-submissions" },
        { label: "Import CVs from Excel", href: "/admin/cv-submissions/import", permission: "candidates.manage" },
      ],
      faqs: [
        {
          question: "Why is the passport number hidden?",
          answer: "Only the last four digits show. Staff with document access can tap Show full number; who looked, and when, is recorded.",
        },
        {
          question: "A person says the form did not send twice in a row.",
          answer: "The form blocks repeated sends for a short while to stop spam. Ask them to wait and try again, or take the CV on WhatsApp.",
        },
      ],
    },
    {
      id: "requirements",
      topic: "Requirements and jobs",
      summary: "Manpower requests from companies and agencies, and the jobs that fill them.",
      icon: HardHat,
      permission: ["requirements.view", "jobs.view"],
      steps: [
        "Open Requirements to see requests from the Company and Travel Agency portals and the public form.",
        "Open one to assign an owner, add a quotation, edit the trades and counts, and write internal notes.",
        "Approve it in the approval centre, then link each trade to a job and record how many are filled.",
        "Open Jobs to review job posts from companies or publish roles that Venkat Sai manages.",
      ],
      links: [
        { label: "Requirements", href: "/admin/requirements", permission: "requirements.view" },
        { label: "Jobs", href: "/admin/jobs", permission: "jobs.view" },
        { label: "Post a job", href: "/admin/jobs/new", permission: "jobs.manage" },
      ],
    },
    {
      id: "pipeline",
      topic: "Candidates, pipeline and interviews",
      summary: "Follow every application from new to selected.",
      icon: KanbanSquare,
      permission: ["candidates.view", "recruitment.view"],
      steps: [
        "Candidates: search every profile. Contact details stay masked until you reveal them with a reason.",
        "Pipeline: move applications stage by stage, one at a time or several together.",
        "Share Venkat Sai managed applications with the employer from the pipeline.",
        "Interviews: schedule one for a company or for us. Reminders go out by themselves.",
      ],
      links: [
        { label: "Candidates", href: "/admin/candidates", permission: "candidates.view" },
        { label: "Pipeline", href: "/admin/pipeline", permission: ["recruitment.view", "recruitment.manage"] },
        { label: "Interviews", href: "/admin/interviews", permission: ["recruitment.view", "recruitment.manage"] },
        { label: "Schedule an interview", href: "/admin/interviews/new", permission: "recruitment.manage" },
      ],
    },
    {
      id: "tests-training-bookings",
      topic: "Trade tests, bookings and the assessment centre",
      summary: "Open test or training dates with seats, take bookings and record results.",
      icon: CalendarCheck2,
      permission: "recruitment.assessments",
      steps: [
        "Open Test & training bookings and tap New date. Add the title, trade, date, time and seats.",
        "Share the booking link on WhatsApp. People book a seat on the website without an account.",
        "Someone phoned or walked in? Open the date and tap Add a booking.",
        "On the day, print the attendance sheet and mark each person Came or Did not come.",
        "Record trade, practical and theory results in the assessment centre.",
      ],
      links: [
        { label: "Test & training bookings", href: "/admin/bookings" },
        { label: "New date", href: "/admin/bookings/new" },
        { label: "Assessment centre", href: "/admin/assessments" },
      ],
      faqs: [
        {
          question: "Can we charge for a trade test?",
          answer: "Never for a test that is part of a job application. Fees are only for training or tests people book for themselves, written with the currency.",
        },
      ],
    },
    {
      id: "mobilisation",
      topic: "Mobilisation",
      summary: "After selection: documents, visa, medical, emigration clearance, travel and arrival.",
      icon: Plane,
      permission: "recruitment.mobilisation",
      steps: [
        "Open Mobilisation and choose the selected candidate.",
        "Tick off the checklist as each document and step is done.",
        "Add visa, medical, emigration and travel details, and the coordinator's notes.",
      ],
      links: [{ label: "Mobilisation", href: "/admin/mobilisation" }],
    },
    {
      id: "approvals",
      topic: "Approval centre",
      summary: "One inbox for everything that needs a second person to check.",
      icon: ListChecks,
      permission: "approvals.view",
      steps: [
        "Open the approval centre. Each item shows exactly what was submitted.",
        "Read it fully, then choose Approve, Request changes (with a note) or Reject (with a reason).",
        "The person who sent it is told about your decision.",
      ],
      links: [{ label: "Approval centre", href: "/admin/approvals" }],
    },
    {
      id: "organisations",
      topic: "Companies, agencies, partners and institutions",
      summary: "Every organisation on the platform, its members and its verification.",
      icon: Building2,
      permission: ["orgs.view", "partners.view"],
      steps: [
        "Open Employers, Recruitment partners or Institutions from the menu.",
        "Open an organisation to see its profile, members, documents and history.",
        "Before approving a verification, check each document. For partners, check the recruitment licence and its expiry.",
        "Assign an account manager, or suspend an organisation that breaks the rules.",
        "Partner assignments: choose which partners work on which requirement, and see their submissions.",
      ],
      links: [
        { label: "Employers", href: "/admin/organizations?type=employer", permission: "orgs.view" },
        { label: "Recruitment partners", href: "/admin/organizations?type=recruitment_partner", permission: "orgs.view" },
        { label: "Institutions", href: "/admin/organizations?type=institution", permission: "orgs.view" },
        { label: "Partner assignments", href: "/admin/partners", permission: ["partners.view", "partners.assign"] },
      ],
    },
    {
      id: "training",
      topic: "Training",
      summary: "Courses, batches and certificates across all institutions and our own centre.",
      icon: GraduationCap,
      permission: "training.view",
      steps: [
        "Open Training to see every course, batch, enrolment and certificate.",
        "Each batch has an Excel download of its learners.",
        "Revoking a certificate marks it as revoked on the public check page and tells the holder.",
      ],
      links: [
        { label: "Training", href: "/admin/training" },
        { label: "Courses", href: "/admin/training/courses" },
        { label: "Batches", href: "/admin/training/batches" },
        { label: "Certificates", href: "/admin/training/certificates" },
      ],
    },
    {
      id: "certificates-letters",
      topic: "Certificates and letters for interns and trainees",
      summary: "Offer letters, internship certificates, LORs and course certificates, made automatically and approved by you.",
      icon: Award,
      permission: "training.certificates",
      steps: [
        "Open Interns, create a programme (for example an online internship batch) and add the interns, one by one or by pasting many lines.",
        "Each intern gets an offer letter. When you tick interns and press Mark finished, their internship certificate and LOR are made too.",
        "Everything waits in Certificates and letters. Open one to read and edit every line, or tick many and press Approve selected.",
        "After approval, send it on WhatsApp or email from the document page, or download the PDF. People with an account also see it under Certificates.",
        "Set who signs (name, title and a signature image) once at the bottom of the Certificates and letters page.",
      ],
      links: [
        { label: "Certificates and letters", href: "/admin/documents" },
        { label: "Interns", href: "/admin/documents/internships" },
      ],
    },
    {
      id: "referrals-reviews-resumes",
      topic: "Referrals, worker reviews and resume requests",
      summary: "Rewards for referrals, reviews from placed workers, and the paid resume service.",
      icon: Gift,
      permission: "candidates.manage",
      steps: [
        "Referrals: when a referred person departs, the reward becomes due. Mark it paid when you pay it.",
        "Worker reviews: ask a departed worker on WhatsApp, then approve or reject what they write. Never write or edit a review.",
        "Resume requests: collect the fee, record the payment or waive it, then send the download link on WhatsApp.",
      ],
      links: [
        { label: "Referrals", href: "/admin/referrals" },
        { label: "Worker reviews", href: "/admin/reviews" },
        { label: "Resume requests", href: "/admin/resume-requests" },
      ],
    },
    {
      id: "leads-support",
      topic: "Leads, support and privacy requests",
      summary: "Enquiries from the website, help requests and data requests.",
      icon: Headset,
      permission: ["leads.view", "support.view", "privacy.requests"],
      steps: [
        "Leads & enquiries: call back companies and people who filled a form on the website.",
        "Support desk: reply to the person, or add an internal note they never see. Resolve with a short summary.",
        "Record a phone call or walk-in as a new support request.",
        "Privacy requests: export or delete a person's data within the deadline shown on each request.",
      ],
      links: [
        { label: "Leads & enquiries", href: "/admin/leads", permission: "leads.view" },
        { label: "Support desk", href: "/admin/support", permission: "support.view" },
        { label: "Record a call or walk-in", href: "/admin/support/new", permission: "support.manage" },
        { label: "Privacy requests", href: "/admin/privacy", permission: "privacy.requests" },
      ],
    },
    {
      id: "website",
      topic: "Website content",
      summary: "Pages, news, media, announcements and public statistics.",
      icon: Newspaper,
      permission: ["content.view", "media.manage", "announcements.manage", "metrics.public_manage", "analytics.view"],
      steps: [
        "Content: edit website pages and entries. Save a draft, then publish or send for approval.",
        "Media library: upload photos. Record consent for any photo that shows a person.",
        "Announcements: show a short message at the top of the website.",
        "Public statistics: only approved, real numbers. Never type a number that is not true.",
        "Analytics: see visits and what people do on the website.",
      ],
      links: [
        { label: "Content", href: "/admin/content", permission: "content.view" },
        { label: "Media library", href: "/admin/media", permission: "media.manage" },
        { label: "Announcements", href: "/admin/announcements", permission: "announcements.manage" },
        { label: "Public statistics", href: "/admin/public-metrics", permission: "metrics.public_manage" },
        { label: "Analytics", href: "/admin/analytics", permission: "analytics.view" },
      ],
    },
    {
      id: "money",
      topic: "Revenue, invoices and billing",
      summary: "Invoices, payments, worker invoices, refunds and partner settlements.",
      icon: Coins,
      permission: "commercial.view",
      steps: [
        "Revenue & billing shows money per currency. It never mixes currencies.",
        "Invoices: create one, issue it, and record payments against it. An issued invoice is never edited: void it and issue a new one.",
        "Worker invoices: for a selected worker, created from their CV page or here.",
        "Refunds and partner settlements go through the approval centre.",
      ],
      links: [
        { label: "Revenue & billing", href: "/admin/commercial" },
        { label: "Invoices", href: "/admin/commercial/invoices" },
        { label: "Worker invoices", href: "/admin/commercial/worker-invoices" },
        { label: "Payments", href: "/admin/commercial/payments" },
      ],
      faqs: [
        {
          question: "Can a candidate be charged a placement fee?",
          answer: "No. Candidates never pay for a job, an application, a placement or an interview. The only paid candidate service is resume preparation, and it is never a condition.",
        },
      ],
    },
    {
      id: "people-settings",
      topic: "Users, roles, settings and security",
      summary: "Staff accounts, what each role can do, and the audit trail.",
      icon: Settings,
      permission: ["users.view", "settings.view", "audit.view", "system.jobs", "settings.security"],
      steps: [
        "Users: find any account. Use Add staff member to give a new colleague access.",
        "Settings → Roles: decide what each staff role can see and do.",
        "Audit logs: see who did what, including every reveal of contact details and every export.",
        "Backup (owner only): download a full Excel backup and keep it safe on the office computer.",
      ],
      links: [
        { label: "Users", href: "/admin/users", permission: "users.view" },
        { label: "Settings", href: "/admin/settings", permission: "settings.view" },
        { label: "Roles", href: "/admin/settings/roles", permission: "settings.view" },
        { label: "Audit logs", href: "/admin/audit", permission: "audit.view" },
        { label: "Backup", href: "/admin/system/backup", permission: "settings.security" },
      ],
    },
    {
      id: "messages",
      topic: "Messages and tasks",
      summary: "Talk to companies, partners and institutions, and keep track of your own work.",
      icon: MessageSquare,
      steps: [
        "Messages: open a conversation, or start a new one with an organisation.",
        "My tasks: work items assigned to you and reminders. Tick them off when done.",
      ],
      links: [
        { label: "Messages", href: "/admin/messages" },
        { label: "New message", href: "/admin/messages/new", permission: ["orgs.view", "candidates.view"] },
        { label: "My tasks", href: "/admin/tasks" },
      ],
    },
  ],
  faqs: [
    {
      question: "I cannot see a menu item or a button that a colleague has.",
      answer: "Your role does not include it. Ask the owner to change your role in Settings → Roles.",
    },
    {
      question: "Why does a phone number show as XXXX1234?",
      answer: "Contact details are masked until someone with permission reveals them. Every reveal is logged with the reason.",
    },
    {
      question: "Can I forward exported Excel files on WhatsApp?",
      answer: "No. Keep exports on the office computer and delete them when you are done. Send documents to employers through the pipeline share or the packs.",
    },
    {
      question: "Something went wrong on a page.",
      answer: "Tap Try again. If it keeps happening, tell the owner the reference code shown on the page.",
    },
  ],
};

// ---------------------------------------------------------------------------
// People Portal (job seekers)
// ---------------------------------------------------------------------------

const TALENT: PortalGuide = {
  portal: "talent",
  title: "How to use your People Portal",
  intro: "Find jobs abroad and in India, apply in a few taps, track every application and grow your skills. Applying is always free.",
  searchExample: "apply",
  quickSteps: [
    { title: "Complete your profile", description: "Trade, experience and documents help employers pick you.", href: "/talent/profile", icon: UserCircle },
    { title: "Find jobs", description: "Search by trade and country, then apply in a few taps.", href: "/talent/jobs", icon: Search },
    { title: "Track your applications", description: "See where each application is and what happens next.", href: "/talent/applications", icon: ClipboardList },
    { title: "Turn on job alerts", description: "Get told when a matching job is posted.", href: "/talent/alerts", icon: Bell },
    { title: "Train and get certified", description: "Courses, tests and certificates in one place.", href: "/talent/training", icon: GraduationCap },
  ],
  sections: [
    {
      id: "profile",
      topic: "Your profile",
      summary: "What employers see when you apply.",
      icon: UserCircle,
      steps: [
        "Open My profile and fill in your trade, experience, skills and languages.",
        "Add your passport details and documents. Only Venkat Sai staff can see your full passport number.",
        "Use Preview to see your profile the way an employer sees it.",
        "Choose if employers may find you in search. You can change this any time.",
      ],
      links: [
        { label: "My profile", href: "/talent/profile" },
        { label: "Preview my profile", href: "/talent/profile/preview" },
      ],
    },
    {
      id: "jobs",
      topic: "Finding and applying for jobs",
      summary: "Search jobs, save the ones you like and apply.",
      icon: Search,
      steps: [
        "Open Find jobs. Search by trade, country or salary.",
        "Tap a job to read the details. Tap Save to keep it for later.",
        "Tap Apply. Answer any questions and send. Applying is always free.",
        "Never pay anyone who asks for money for a job. Report it to us on WhatsApp.",
      ],
      links: [
        { label: "Find jobs", href: "/talent/jobs" },
        { label: "Saved jobs", href: "/talent/saved" },
      ],
    },
    {
      id: "applications",
      topic: "Applications and interviews",
      summary: "Follow each application from sent to selected.",
      icon: ClipboardList,
      steps: [
        "Open Applications to see the status of each one.",
        "Open an application to see its history and any message from the employer.",
        "Interviews lists your interview dates and trade tests with the time and place.",
        "You can withdraw an application if you change your mind.",
      ],
      links: [
        { label: "Applications", href: "/talent/applications" },
        { label: "Interviews", href: "/talent/interviews" },
      ],
    },
    {
      id: "alerts",
      topic: "Job alerts",
      summary: "Get a notification when a job that matches you is posted.",
      icon: Bell,
      steps: ["Open Job alerts.", "Type the job you want (for example: welder) and choose the country.", "Turn an alert off any time."],
      links: [{ label: "Job alerts", href: "/talent/alerts" }],
    },
    {
      id: "training",
      topic: "Training, assessments and certificates",
      summary: "Learn new skills and prove them.",
      icon: GraduationCap,
      steps: [
        "Open Training to browse courses and apply for a batch.",
        "Assessments shows your test results.",
        "Certificates keeps every certificate you earned. Employers can check them online.",
      ],
      links: [
        { label: "Training", href: "/talent/training" },
        { label: "Courses", href: "/talent/training/courses" },
        { label: "Assessments", href: "/talent/assessments" },
        { label: "Certificates", href: "/talent/certificates" },
      ],
    },
    {
      id: "career",
      topic: "Career services",
      summary: "Build a clear resume to send with your applications.",
      icon: Sparkles,
      steps: ["Open Career services to build your resume from your profile.", "Download it and keep it ready to share."],
      links: [
        { label: "Career services", href: "/talent/career" },
        { label: "My resume", href: "/talent/career/resume" },
      ],
    },
    {
      id: "messages-support",
      topic: "Messages, notifications and help",
      summary: "Talk to the Venkat Sai team and get help.",
      icon: MessageSquare,
      steps: [
        "Notifications shows every update about your applications.",
        "Messages holds your conversations with the Venkat Sai team.",
        "Need help? Open Support and send a request, or WhatsApp the office.",
      ],
      links: [
        { label: "Notifications", href: "/talent/notifications" },
        { label: "Messages", href: "/talent/messages" },
        { label: "Support", href: "/talent/support" },
        { label: "New support request", href: "/talent/support/new" },
      ],
    },
    {
      id: "privacy",
      topic: "Privacy and your account",
      summary: "Control your data, password and sign-in.",
      icon: ShieldCheck,
      steps: [
        "Privacy & data: download your data or ask us to delete it.",
        "Account security: change your password and sign-in settings.",
        "Change the language with the language button at the top.",
      ],
      links: [
        { label: "Privacy & data", href: "/talent/privacy" },
        { label: "Account security", href: "/account/security" },
      ],
    },
  ],
  faqs: [
    { question: "Do I have to pay to apply or to get a job?", answer: "No. Applying, interviews and placement are free for you. Never pay anyone who asks for a job fee." },
    { question: "Who can see my phone number and passport?", answer: "Your contact details are shared with an employer only when you apply to their job. Your full passport number is visible only to Venkat Sai staff." },
    { question: "I forgot my password.", answer: "On the sign-in page tap Forgot password and follow the steps. You can also WhatsApp the office." },
    { question: "I do not have a CV.", answer: "You can still apply. Fill in your profile, or use Career services to build a resume from it." },
  ],
};

// ---------------------------------------------------------------------------
// Company Portal (direct companies and HR teams)
// ---------------------------------------------------------------------------

const EMPLOYER: PortalGuide = {
  portal: "employer",
  title: "How to use the Company Portal",
  intro: "Tell us who you need, post jobs, review candidates and follow every hire. Venkat Sai sources, screens and tests candidates for you.",
  searchExample: "interview",
  quickSteps: [
    {
      title: "Complete your company profile",
      description: "Verified companies can publish jobs and build trust.",
      href: "/employer/company",
      icon: Building2,
      permission: "employer.company.manage",
    },
    {
      title: "Send a workforce requirement",
      description: "List the trades, how many people and by when.",
      href: "/employer/requirements/new",
      icon: HardHat,
      permission: "employer.requirements.manage",
    },
    { title: "Post a job", description: "Save a draft; we review it before it goes live.", href: "/employer/jobs/new", icon: Briefcase, permission: "employer.jobs.view" },
    {
      title: "Review candidates",
      description: "Move people through the stages in the pipeline.",
      href: "/employer/pipeline",
      icon: KanbanSquare,
      permission: "employer.pipeline.view",
    },
    { title: "Invite your team", description: "Give colleagues the right role.", href: "/employer/team", icon: Users, permission: "employer.team.manage" },
  ],
  sections: [
    {
      id: "company",
      topic: "Company profile and verification",
      summary: "Your company details and the check Venkat Sai does before your jobs go live.",
      icon: Building2,
      permission: "employer.company.manage",
      steps: [
        "Open Company profile and fill in your details, branches and logo.",
        "Open Verification, upload your registration documents and submit.",
        "Venkat Sai checks them. Verified companies get a verified badge and can publish jobs.",
      ],
      links: [
        { label: "Company profile", href: "/employer/company" },
        { label: "Verification", href: "/employer/company/verification" },
      ],
    },
    {
      id: "requirements",
      topic: "Workforce requirements",
      summary: "Tell us how many people you need, for which trades and by when.",
      icon: HardHat,
      permission: "employer.requirements.manage",
      steps: [
        "Open Workforce requirements and tap New requirement.",
        "Add every trade with the number of people, salary and dates. Save a draft any time.",
        "Submit it. Venkat Sai reviews it and gets back to you. After submitting, ask your Venkat Sai contact for changes.",
        "Once approved, the requirement becomes jobs and candidates in your pipeline.",
      ],
      links: [
        { label: "Workforce requirements", href: "/employer/requirements" },
        { label: "New requirement", href: "/employer/requirements/new" },
      ],
    },
    {
      id: "jobs",
      topic: "Jobs",
      summary: "Create, submit and track your job posts.",
      icon: Briefcase,
      permission: "employer.jobs.view",
      steps: [
        "Open Jobs and tap Post a job. Describe the role and the salary honestly.",
        "Submit it. Venkat Sai checks every job before it is published.",
        "Pause, close or extend a job from its page. Applications stay in your pipeline.",
      ],
      links: [
        { label: "Jobs", href: "/employer/jobs" },
        { label: "Post a job", href: "/employer/jobs/new" },
      ],
    },
    {
      id: "candidates",
      topic: "Candidates, lists and pipeline",
      summary: "Find people, shortlist them and move them through the stages.",
      icon: Search,
      permission: ["employer.candidates.search", "employer.candidates.lists", "employer.pipeline.view"],
      steps: [
        "Find candidates: search people who chose to be found. Profiles stay masked until they apply or you unlock contact details.",
        "Talent lists: save people into shortlists. Notes stay inside your company.",
        "Pipeline: each job's candidates by stage. Move a candidate forward or reject with a reason.",
        "Compare candidates side by side before you decide.",
      ],
      links: [
        { label: "Find candidates", href: "/employer/candidates" },
        { label: "Talent lists", href: "/employer/lists" },
        { label: "Pipeline", href: "/employer/pipeline" },
      ],
    },
    {
      id: "interviews-offers",
      topic: "Interviews, offers and placements",
      summary: "Schedule interviews, make offers and follow joining.",
      icon: CalendarClock,
      permission: ["employer.interviews.manage", "employer.offers.manage"],
      steps: [
        "Schedule an interview from a candidate's application in the pipeline. Everyone is told automatically.",
        "Make an offer from the application. Drafts stay private until you issue them.",
        "Offers & placements shows accepted offers and joining progress. Candidates are never charged for an offer, visa or joining.",
      ],
      links: [
        { label: "Interviews", href: "/employer/interviews" },
        { label: "Offers & placements", href: "/employer/offers" },
      ],
    },
    {
      id: "reports",
      topic: "Reports",
      summary: "Live figures from your own jobs and applications.",
      icon: Gauge,
      permission: "employer.reports.view",
      steps: ["Open Reports and choose a date range.", "See applications, interviews and placements over time."],
      links: [{ label: "Reports", href: "/employer/reports" }],
    },
    {
      id: "team",
      topic: "Team and announcements",
      summary: "Invite colleagues and ask us to share your news.",
      icon: Users,
      permission: ["employer.team.manage", "employer.company.manage"],
      steps: [
        "Team: invite a colleague by email and choose their role. They only see what the role allows.",
        "Announcements: ask Venkat Sai to share a walk-in interview or hiring drive. Each one is reviewed first.",
      ],
      links: [
        { label: "Team", href: "/employer/team" },
        { label: "Announcements", href: "/employer/announcements" },
      ],
    },
    {
      id: "billing",
      topic: "Billing",
      summary: "Invoices, payments and billing details.",
      icon: CreditCard,
      permission: "employer.billing.view",
      steps: ["Open Billing to see your plan, invoices and payments.", "Keep your billing details (address, tax number) up to date."],
      links: [
        { label: "Billing", href: "/employer/billing" },
        { label: "Invoices", href: "/employer/billing/invoices" },
        { label: "Billing details", href: "/employer/billing/details" },
      ],
    },
    {
      id: "messages-support",
      topic: "Messages and support",
      summary: "Talk to the Venkat Sai team.",
      icon: MessageSquare,
      steps: [
        "Messages: quick questions to the Venkat Sai team.",
        "Support: raise a request for a problem that needs tracking. You can follow its progress.",
      ],
      links: [
        { label: "Messages", href: "/employer/messages" },
        { label: "New message", href: "/employer/messages/new" },
        { label: "Support", href: "/employer/support" },
        { label: "New support request", href: "/employer/support/new" },
      ],
    },
  ],
  faqs: [
    { question: "Why is my job not live yet?", answer: "Venkat Sai reviews every job before it is published, and your company must be verified. You are notified of the decision." },
    { question: "Why can't I see a candidate's phone number?", answer: "Profiles stay masked until the candidate applies to your job or you unlock their contact details." },
    { question: "A menu item is missing.", answer: "Your role does not include it. Ask your workspace owner to change your role in Team." },
    { question: "Do candidates pay anything?", answer: "No. Candidates are never charged for applying, an offer, visa processing or joining." },
  ],
};

// ---------------------------------------------------------------------------
// Travel Agency Portal (the employer workspace for travel agencies, served at /agency)
// ---------------------------------------------------------------------------

const AGENCY: PortalGuide = {
  portal: "agency",
  title: "How to use the Travel Agency Portal",
  intro: "Send us manpower requirements from your clients abroad, follow the candidates we put forward, and track deployment.",
  searchExample: "visa",
  quickSteps: [
    {
      title: "Complete your agency profile",
      description: "Verification unlocks every feature for your agency.",
      href: "/agency/company",
      icon: Building2,
      permission: "employer.company.manage",
    },
    {
      title: "Send a manpower requirement",
      description: "Trades, number of people, salary and the demand letter.",
      href: "/agency/requirements/new",
      icon: HardHat,
      permission: "employer.requirements.manage",
    },
    {
      title: "Review candidates",
      description: "See who we put forward and move them through the stages.",
      href: "/agency/pipeline",
      icon: KanbanSquare,
      permission: "employer.pipeline.view",
    },
    {
      title: "Track deployment",
      description: "Selected workers on their way to the job site.",
      href: "/agency/offers",
      icon: Plane,
      permission: "employer.offers.manage",
    },
    { title: "Message the Venkat Sai team", description: "Quick questions about any requirement.", href: "/agency/messages", icon: MessageSquare },
  ],
  sections: [
    {
      id: "agency-profile",
      topic: "Agency profile and verification",
      summary: "Your agency details and the check Venkat Sai does.",
      icon: Building2,
      permission: "employer.company.manage",
      steps: [
        "Open Agency profile & verification and fill in your details.",
        "Upload your registration documents and submit them for verification.",
        "Venkat Sai checks them and tells you the result.",
      ],
      links: [
        { label: "Agency profile", href: "/agency/company" },
        { label: "Verification", href: "/agency/company/verification" },
      ],
    },
    {
      id: "requirements",
      topic: "Manpower requirements",
      summary: "Requirements from your clients abroad, with the demand letter.",
      icon: HardHat,
      permission: "employer.requirements.manage",
      steps: [
        "Open Manpower requirements and tap New requirement.",
        "Add each trade with the number of people, salary, country and dates. Attach the demand letter.",
        "Save a draft any time, then submit. Venkat Sai reviews it and gets back to you.",
        "We source, screen and trade-test candidates and put them forward in your pipeline.",
      ],
      links: [
        { label: "Manpower requirements", href: "/agency/requirements" },
        { label: "New requirement", href: "/agency/requirements/new" },
      ],
    },
    {
      id: "candidates",
      topic: "Candidates and pipeline",
      summary: "The people we put forward, stage by stage.",
      icon: KanbanSquare,
      permission: "employer.pipeline.view",
      steps: [
        "Open Candidates & pipeline and choose a requirement or job.",
        "Open a candidate to see their profile, documents shared with you and trade test results.",
        "Move them forward, or reject with a reason so we can send better matches.",
      ],
      links: [{ label: "Candidates & pipeline", href: "/agency/pipeline" }],
    },
    {
      id: "interviews",
      topic: "Interviews",
      summary: "Client interviews and trade tests.",
      icon: CalendarClock,
      permission: "employer.interviews.manage",
      steps: ["Schedule an interview from a candidate's application.", "Candidates and panel members are told automatically."],
      links: [{ label: "Interviews", href: "/agency/interviews" }],
    },
    {
      id: "deployment",
      topic: "Deployment and mobilisation",
      summary: "Offers, visa and travel for selected workers.",
      icon: Plane,
      permission: "employer.offers.manage",
      steps: [
        "Make an offer from the candidate's application.",
        "Deployment & mobilisation shows each selected worker's joining progress.",
        "Workers are never charged for an offer, visa processing or joining.",
      ],
      links: [{ label: "Deployment & mobilisation", href: "/agency/offers" }],
    },
    {
      id: "team-billing",
      topic: "Team and billing",
      summary: "Your colleagues and your invoices.",
      icon: Users,
      permission: ["employer.team.manage", "employer.billing.view"],
      steps: ["Team: invite colleagues by email and give each the right role.", "Billing: see invoices and payments, and keep billing details current."],
      links: [
        { label: "Team", href: "/agency/team" },
        { label: "Billing", href: "/agency/billing" },
      ],
    },
    {
      id: "messages-support",
      topic: "Messages and support",
      summary: "Talk to the Venkat Sai team.",
      icon: MessageSquare,
      steps: ["Messages: quick questions about a requirement.", "Support: raise a request for anything that needs tracking."],
      links: [
        { label: "Messages", href: "/agency/messages" },
        { label: "Support", href: "/agency/support" },
        { label: "New support request", href: "/agency/support/new" },
      ],
    },
  ],
  faqs: [
    { question: "How soon do we get candidates?", answer: "After Venkat Sai approves your requirement. Your Venkat Sai contact keeps you updated in Messages." },
    { question: "Can I change a requirement after submitting it?", answer: "Ask your Venkat Sai contact in Messages. Submitted requirements are locked so everyone works from the same version." },
    { question: "A menu item is missing.", answer: "Your role does not include it. Ask your workspace owner to change your role in Team." },
    { question: "Do workers pay anything?", answer: "No. Workers are never charged for selection, an offer, visa processing or joining." },
  ],
};

// ---------------------------------------------------------------------------
// Partner Portal (recruitment partners)
// ---------------------------------------------------------------------------

const RECRUITER: PortalGuide = {
  portal: "recruiter",
  title: "How to use the Partner Portal",
  intro: "Work on requirements Venkat Sai assigns to your agency, submit consenting candidates and follow them to placement.",
  searchExample: "submit",
  quickSteps: [
    {
      title: "Get your agency verified",
      description: "Add your recruitment licence so we can assign requirements.",
      href: "/recruiter/profile/verification",
      icon: BadgeCheck,
      permission: "partner.profile.manage",
    },
    {
      title: "Open an assigned requirement",
      description: "Read the target, limits and your commission terms.",
      href: "/recruiter/requirements",
      icon: ClipboardList,
      permission: "partner.requirements.view",
    },
    {
      title: "Submit a candidate",
      description: "From the requirement page, with the candidate's consent.",
      href: "/recruiter/requirements",
      icon: Inbox,
      permission: "partner.candidates.submit",
    },
    {
      title: "Follow your submissions",
      description: "Our review, feedback and hiring progress.",
      href: "/recruiter/submissions",
      icon: Target,
      permission: "partner.submissions.view",
    },
    {
      title: "Check settlements",
      description: "Commission owed for your placements.",
      href: "/recruiter/settlements",
      icon: Wallet,
      permission: "partner.settlements.view",
    },
  ],
  sections: [
    {
      id: "verification",
      topic: "Agency profile and verification",
      summary: "Your registered details and recruitment licences.",
      icon: BadgeCheck,
      permission: "partner.profile.manage",
      steps: [
        "Open Agency profile and fill in your registered details, services and territories.",
        "Add your Recruiting Agent registration or the licence from your country, with a scan.",
        "Submit for verification. You receive requirements once Venkat Sai has checked it.",
      ],
      links: [
        { label: "Agency profile", href: "/recruiter/profile" },
        { label: "Verification", href: "/recruiter/profile/verification" },
      ],
    },
    {
      id: "requirements",
      topic: "Assigned requirements",
      summary: "Only the requirements Venkat Sai assigns to you.",
      icon: ClipboardList,
      permission: "partner.requirements.view",
      steps: [
        "Open Assigned requirements to see targets, submission limits and your commission terms.",
        "Open one to read the instructions and the target job.",
        "Tap Submit a candidate to send a consenting candidate.",
      ],
      links: [{ label: "Assigned requirements", href: "/recruiter/requirements" }],
    },
    {
      id: "submissions",
      topic: "Submissions and your candidate pool",
      summary: "Everyone you submitted, with our feedback.",
      icon: Inbox,
      permission: ["partner.submissions.view", "partner.candidates.submit"],
      steps: [
        "Submissions shows Venkat Sai's review, feedback and hiring progress for each candidate.",
        "My candidates is your pool. Submit someone again to another requirement while their consent is in place.",
        "Interviews lists interview and trade-test dates. Help your candidates prepare and attend.",
      ],
      links: [
        { label: "Submissions", href: "/recruiter/submissions" },
        { label: "My candidates", href: "/recruiter/candidates" },
        { label: "Interviews", href: "/recruiter/interviews" },
      ],
      faqs: [
        { question: "Can I ask a candidate for a fee?", answer: "Never. Your commission is paid by Venkat Sai after the conditions are met. Candidates are never charged." },
      ],
    },
    {
      id: "documents",
      topic: "Documents for mobilisation",
      summary: "Papers needed when a candidate you placed is getting ready to travel.",
      icon: FileText,
      permission: "partner.documents.manage",
      steps: ["When a placed candidate starts mobilisation, the needed documents are listed here.", "Upload each one from the candidate's page."],
      links: [{ label: "Documents", href: "/recruiter/documents" }],
    },
    {
      id: "money",
      topic: "Performance, settlements and billing",
      summary: "Your results and the commission Venkat Sai owes you.",
      icon: Wallet,
      permission: ["partner.performance.view", "partner.settlements.view", "partner.billing.manage"],
      steps: [
        "Performance: live figures from your submissions. Choose a period to compare.",
        "Settlements: commission grouped by period and currency. Raise a query if something looks wrong.",
        "Billing: invoices, payments and billing details.",
      ],
      links: [
        { label: "Performance", href: "/recruiter/performance" },
        { label: "Settlements", href: "/recruiter/settlements" },
        { label: "Billing", href: "/recruiter/billing" },
      ],
    },
    {
      id: "team",
      topic: "Team and announcements",
      summary: "Your colleagues, and news you want candidates to see.",
      icon: Users,
      permission: ["partner.team.manage", "partner.profile.manage"],
      steps: [
        "Team: invite colleagues and give each the right role.",
        "Announcements: ask Venkat Sai to share a registration drive or trade-test day. Each one is reviewed. Never ask candidates to pay.",
      ],
      links: [
        { label: "Team", href: "/recruiter/team" },
        { label: "Announcements", href: "/recruiter/announcements" },
      ],
    },
    {
      id: "messages-support",
      topic: "Messages and support",
      summary: "Talk to the Venkat Sai team.",
      icon: MessageSquare,
      steps: ["Messages: quick questions about an assignment.", "Support: raise a request for anything that needs tracking."],
      links: [
        { label: "Messages", href: "/recruiter/messages" },
        { label: "Support", href: "/recruiter/support" },
        { label: "New support request", href: "/recruiter/support/new" },
      ],
    },
  ],
  faqs: [
    { question: "Why do I see no requirements?", answer: "Your agency must be verified, and Venkat Sai must assign a requirement to you. You only see what is assigned to you." },
    { question: "Will the employer know which agency sent a candidate?", answer: "No. Venkat Sai presents candidates to employers; your agency's name and terms stay private." },
    { question: "A menu item is missing.", answer: "Your role does not include it. Ask your workspace owner to change your role in Team." },
  ],
};

// ---------------------------------------------------------------------------
// Institution Portal (training institutions)
// ---------------------------------------------------------------------------

const INSTITUTION: PortalGuide = {
  portal: "institution",
  title: "How to use the Institution Portal",
  intro: "Publish courses, run batches, record attendance and results, issue certificates and help your learners get placed.",
  searchExample: "attendance",
  quickSteps: [
    {
      title: "Complete your profile",
      description: "Verified institutions build trust with learners and employers.",
      href: "/institution/profile",
      icon: Building2,
      permission: "institution.profile.manage",
    },
    { title: "Add a course", description: "Syllabus, fees, eligibility and what learners earn.", href: "/institution/courses/new", icon: BookOpen, permission: "institution.courses.manage" },
    {
      title: "Schedule a batch",
      description: "Dates, seats and venue; open it for enrolment.",
      href: "/institution/batches/new",
      icon: CalendarClock,
      permission: "institution.batches.manage",
    },
    { title: "Manage students", description: "Confirm applicants and take attendance.", href: "/institution/students", icon: Users, permission: "institution.students.manage" },
    { title: "Issue certificates", description: "For learners who completed a course.", href: "/institution/certificates", icon: Award, permission: "institution.certificates.issue" },
  ],
  sections: [
    {
      id: "profile",
      topic: "Profile and verification",
      summary: "Your details, documents and verification.",
      icon: Building2,
      permission: "institution.profile.manage",
      steps: [
        "Open Profile and fill in your details, logo and cover image.",
        "Upload your documents and submit them for verification.",
        "Venkat Sai checks them and tells you the result.",
      ],
      links: [{ label: "Profile", href: "/institution/profile" }],
    },
    {
      id: "courses",
      topic: "Courses",
      summary: "Your course catalogue.",
      icon: BookOpen,
      permission: "institution.courses.manage",
      steps: [
        "Open Courses and tap New course. Describe the duration, eligibility, fees and exactly what learners earn.",
        "Add at least one module to the syllabus.",
        "Submit it. Courses are published after Venkat Sai reviews them.",
      ],
      links: [
        { label: "Courses", href: "/institution/courses" },
        { label: "New course", href: "/institution/courses/new" },
      ],
    },
    {
      id: "batches-students",
      topic: "Batches, students and attendance",
      summary: "Run each batch from enrolment to completion.",
      icon: CalendarClock,
      permission: ["institution.batches.manage", "institution.students.manage"],
      steps: [
        "Open Batches and tap Schedule a batch. Set the dates, seats and venue.",
        "Open the batch for enrolment once the course is published. Learners apply from your course page.",
        "Students: confirm learners while seats are free, or put them on the waitlist.",
        "Take attendance on your phone in class from the batch page.",
      ],
      links: [
        { label: "Batches", href: "/institution/batches" },
        { label: "Schedule a batch", href: "/institution/batches/new" },
        { label: "Students", href: "/institution/students" },
      ],
    },
    {
      id: "assessments-certificates",
      topic: "Assessments and certificates",
      summary: "Tests, scores and certificates.",
      icon: ClipboardCheck,
      permission: ["institution.assessments.manage", "institution.certificates.issue"],
      steps: [
        "Add theory tests, practicals, vivas or projects to a batch, then enter each learner's score.",
        "Calculate results on the batch's assessments tab.",
        "Issue a certificate to each learner who completed. Anyone can check it on the public verification page.",
        "Revoke a certificate only if it was issued in error. The learner is told why.",
      ],
      links: [
        { label: "Assessments", href: "/institution/assessments" },
        { label: "Certificates", href: "/institution/certificates" },
      ],
    },
    {
      id: "placements",
      topic: "Placements",
      summary: "Campus drives, internships and where your learners were placed.",
      icon: Target,
      permission: "institution.placements.manage",
      steps: [
        "Create a drive or programme with a host employer, dates and stipend, then open it for applications.",
        "Record each placement with the offer or appointment letter. Venkat Sai verifies outcomes before they count publicly.",
        "Learners are never charged to register or be placed.",
      ],
      links: [{ label: "Placements", href: "/institution/placements" }],
    },
    {
      id: "reports",
      topic: "Reports",
      summary: "Completion, pass and placement rates from your live records.",
      icon: Gauge,
      permission: "institution.reports.view",
      steps: ["Open Reports to see completion, pass and placement rates.", "Learners whose outcome is not decided yet are left out of the rates."],
      links: [{ label: "Reports", href: "/institution/reports" }],
    },
    {
      id: "team-billing",
      topic: "Team, announcements and billing",
      summary: "Coordinators, instructors, news and invoices.",
      icon: Users,
      permission: ["institution.team.manage", "institution.profile.manage", "institution.billing.manage"],
      steps: [
        "Team: invite coordinators, instructors and placement officers with the right role.",
        "Announcements: ask Venkat Sai to share admissions, new batches or open days. Each one is reviewed.",
        "Billing: invoices, payments and billing details.",
      ],
      links: [
        { label: "Team", href: "/institution/team" },
        { label: "Announcements", href: "/institution/announcements" },
        { label: "Billing", href: "/institution/billing" },
      ],
    },
    {
      id: "messages-support",
      topic: "Messages and support",
      summary: "Talk to the Venkat Sai team.",
      icon: MessageSquare,
      steps: ["Messages: quick questions to the Venkat Sai team.", "Support: raise a request for anything that needs tracking."],
      links: [
        { label: "Messages", href: "/institution/messages" },
        { label: "Support", href: "/institution/support" },
        { label: "New support request", href: "/institution/support/new" },
      ],
    },
  ],
  faqs: [
    { question: "Why is my course not in the catalogue?", answer: "Courses are published after Venkat Sai reviews them. Add at least one module and submit it." },
    { question: "An instructor cannot take attendance.", answer: "Add them to the batch's team, or give them a role that includes batches." },
    { question: "A menu item is missing.", answer: "Your role does not include it. Ask your workspace owner to change your role in Team." },
  ],
};

export const PORTAL_GUIDES: Record<GuidePortalKey, PortalGuide> = {
  admin: ADMIN,
  talent: TALENT,
  employer: EMPLOYER,
  agency: AGENCY,
  recruiter: RECRUITER,
  institution: INSTITUTION,
};

/**
 * Whether a viewer holding `permissions` may see an item. `null` means "do not filter" (the People Portal has
 * no role permissions). Items without a permission always show.
 */
export function canSeeGuideItem(permission: GuidePermission | undefined, permissions: readonly string[] | ReadonlySet<string> | null): boolean {
  if (!permission || permissions === null) return true;
  const has = (key: string) => (permissions instanceof Set ? permissions.has(key) : (permissions as readonly string[]).includes(key));
  return typeof permission === "string" ? has(permission) : permission.some(has);
}

/** The guide of `portal` with steps, sections and section links the viewer cannot use left out. */
export function guideFor(portal: GuidePortalKey, permissions: readonly string[] | ReadonlySet<string> | null = null): PortalGuide {
  const guide = PORTAL_GUIDES[portal];
  return {
    ...guide,
    quickSteps: guide.quickSteps.filter((step) => canSeeGuideItem(step.permission, permissions)),
    sections: guide.sections
      .filter((section) => canSeeGuideItem(section.permission, permissions))
      .map((section) => ({ ...section, links: section.links.filter((link) => canSeeGuideItem(link.permission, permissions)) })),
  };
}

/** Every href in every guide (tests check them against the app's routes). */
export function allGuideHrefs(): { portal: GuidePortalKey; href: string }[] {
  return (Object.keys(PORTAL_GUIDES) as GuidePortalKey[]).flatMap((portal) => {
    const guide = PORTAL_GUIDES[portal];
    return [
      ...guide.quickSteps.map((s) => ({ portal, href: s.href })),
      ...guide.sections.flatMap((s) => s.links.map((l) => ({ portal, href: l.href }))),
      { portal, href: PORTAL_HELP_HREF[portal] },
    ];
  });
}

