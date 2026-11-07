/**
 * Permission catalogue + default roles (client-safe).
 *
 * - Platform permissions apply to Venkat Sai staff (scope "platform").
 * - Organisation permissions apply to members of an employer / recruitment partner / institution.
 * - Candidates have no permission strings: candidate access is ownership-based.
 *
 * Roles are stored in the `roles` table (editable at /admin/settings/roles); DEFAULT_ROLES is what
 * `npm run db:seed` installs. Code must check PERMISSIONS, never role keys (except "super_admin").
 */
import type { OrgType, RoleScope } from "@/db/schema/_constants";

type PermissionDef = { key: string; label: string; group: string; sensitive?: boolean };

const def = (group: string, items: [string, string, boolean?][]): PermissionDef[] =>
  items.map(([key, label, sensitive]) => ({ key, label, group, sensitive: sensitive ?? false }));

export const PLATFORM_PERMISSIONS = [
  ...def("Dashboard", [["dashboard.view", "View executive dashboard"]]),
  ...def("Users", [
    ["users.view", "View user accounts"],
    ["users.manage", "Suspend / reactivate users, edit account details"],
    ["users.security", "Revoke sessions, reset two-factor authentication", true],
    ["users.roles", "Assign Venkat Sai staff roles", true],
  ]),
  ...def("Organisations", [
    ["orgs.view", "View employers, partners and institutions"],
    ["orgs.manage", "Edit and suspend organisations"],
    ["orgs.verify", "Review and decide organisation verification"],
  ]),
  ...def("Jobs", [
    ["jobs.view", "View all jobs"],
    ["jobs.manage", "Create, edit, close and schedule jobs"],
    ["jobs.approve", "Approve / reject job publication"],
    ["jobs.feature", "Feature and promote jobs"],
  ]),
  ...def("Candidates", [
    ["candidates.view", "Search and view candidate profiles (masked)"],
    ["candidates.manage", "Edit candidate records, notes, duplicates"],
    ["candidates.view_contact", "Reveal candidate contact details (logged)", true],
    ["candidates.view_documents", "Open candidate documents (logged)", true],
    ["candidates.verify", "Verify documents, credentials and experience"],
    ["candidates.export", "Export candidate data", true],
  ]),
  ...def("Recruitment operations", [
    ["recruitment.view", "View pipelines, interviews and placements"],
    ["recruitment.manage", "Assign candidates, move stages, schedule interviews"],
    ["recruitment.assessments", "Schedule and record skill / trade assessments"],
    ["recruitment.mobilisation", "Manage offers, documentation and mobilisation"],
  ]),
  ...def("Requirements & leads", [
    ["requirements.view", "View workforce requirement requests"],
    ["requirements.manage", "Process requirement requests"],
    ["leads.view", "View leads and enquiries"],
    ["leads.manage", "Assign and progress leads and enquiries"],
  ]),
  ...def("Recruitment partners", [
    ["partners.view", "View partner records and performance"],
    ["partners.manage", "Manage partner agreements and status"],
    ["partners.assign", "Assign requirements to partners"],
    ["partners.settlements", "Manage partner settlements", true],
  ]),
  ...def("Training", [
    ["training.view", "View courses, batches and enrolments"],
    ["training.manage", "Manage courses, batches and assessment centres"],
    ["training.certificates", "Issue and revoke Venkat Sai certificates"],
  ]),
  ...def("Approvals", [
    ["approvals.view", "View the approval centre"],
    ["approvals.decide", "Approve, reject or request changes"],
    ["approvals.escalate", "Escalate and reassign approvals"],
  ]),
  ...def("Content (CMS)", [
    ["content.view", "View CMS content"],
    ["content.edit", "Create and edit drafts"],
    ["content.publish", "Publish, schedule, archive and roll back content"],
    ["media.manage", "Manage the media library"],
    ["announcements.manage", "Publish global announcements"],
    ["metrics.public_manage", "Manage public statistics shown on the website"],
  ]),
  ...def("Commercial", [
    ["commercial.view", "View subscriptions, invoices and payments"],
    ["commercial.plans", "Create and edit plans, prices, coupons"],
    ["commercial.invoices", "Issue and void invoices"],
    ["commercial.payments", "Record offline payments", true],
    ["commercial.refunds", "Process refunds and disputes", true],
    ["commercial.reports", "View revenue reports"],
  ]),
  ...def("Support", [
    ["support.view", "View support tickets"],
    ["support.manage", "Assign, respond to and resolve tickets"],
    ["support.grievances", "Handle grievances (grievance officer)"],
  ]),
  ...def("Privacy", [
    ["privacy.requests", "Process data-subject requests", true],
    ["privacy.consents", "View consent records"],
  ]),
  ...def("Notifications", [
    ["notifications.templates", "Edit notification templates"],
    ["notifications.logs", "View delivery logs"],
  ]),
  ...def("Analytics", [
    ["analytics.view", "View aggregate website analytics"],
    ["analytics.sessions", "Open pseudonymous session diagnostics (logged)", true],
    ["analytics.export", "Export analytics data"],
    ["analytics.configure", "Configure events, funnels and retention"],
  ]),
  ...def("Settings", [
    ["settings.view", "View platform settings"],
    ["settings.manage", "Edit general settings"],
    ["settings.taxonomies", "Edit taxonomies (skills, industries, countries...)"],
    ["settings.flags", "Toggle modules and feature flags"],
    ["settings.roles", "Edit roles and permissions", true],
    ["settings.integrations", "Configure integrations"],
    ["settings.security", "Configure security policies", true],
  ]),
  ...def("Audit & system", [
    ["audit.view", "View audit, security and data-access logs", true],
    ["system.jobs", "Monitor background jobs"],
    ["system.dev_outbox", "View the development outbox"],
  ]),
] as const satisfies readonly PermissionDef[];

export const EMPLOYER_PERMISSIONS = [
  ...def("Workspace", [
    ["employer.dashboard", "View dashboard"],
    ["employer.company.manage", "Edit company profile and verification"],
    ["employer.team.manage", "Invite members and manage roles"],
  ]),
  ...def("Hiring", [
    ["employer.jobs.view", "View jobs"],
    ["employer.jobs.manage", "Create, edit and submit jobs"],
    ["employer.requirements.manage", "Submit workforce / bulk requirements"],
    ["employer.candidates.search", "Search the candidate database"],
    ["employer.candidates.unlock", "Unlock candidate contact details (uses credits)"],
    ["employer.candidates.lists", "Manage shortlists and talent lists"],
    ["employer.pipeline.view", "View hiring pipeline"],
    ["employer.pipeline.manage", "Move candidates, give feedback"],
    ["employer.interviews.manage", "Schedule and manage interviews"],
    ["employer.offers.manage", "Manage offers"],
    ["employer.reports.view", "View recruitment reports"],
  ]),
  ...def("Billing", [
    ["employer.billing.view", "View subscription and invoices"],
    ["employer.billing.manage", "Purchase plans and credits, manage billing"],
  ]),
] as const satisfies readonly PermissionDef[];

export const PARTNER_PERMISSIONS = [
  ...def("Workspace", [
    ["partner.dashboard", "View dashboard"],
    ["partner.profile.manage", "Edit agency profile, licences and agreements"],
    ["partner.team.manage", "Invite members and manage roles"],
  ]),
  ...def("Recruitment", [
    ["partner.requirements.view", "View assigned requirements"],
    ["partner.candidates.submit", "Submit candidates"],
    ["partner.submissions.view", "Track submissions"],
    ["partner.documents.manage", "Upload requested documents"],
    ["partner.messages", "Message assigned Venkat Sai staff"],
    ["partner.performance.view", "View performance"],
  ]),
  ...def("Commercial", [
    ["partner.settlements.view", "View settlements"],
    ["partner.billing.manage", "Manage plan and invoices"],
  ]),
] as const satisfies readonly PermissionDef[];

export const INSTITUTION_PERMISSIONS = [
  ...def("Workspace", [
    ["institution.dashboard", "View dashboard"],
    ["institution.profile.manage", "Edit institution profile and verification"],
    ["institution.team.manage", "Invite members and manage roles"],
  ]),
  ...def("Training", [
    ["institution.courses.manage", "Manage courses and syllabuses"],
    ["institution.batches.manage", "Manage batches and instructors"],
    ["institution.students.manage", "Manage enrolments and attendance"],
    ["institution.assessments.manage", "Schedule assessments and record scores"],
    ["institution.certificates.issue", "Issue certificates (authorised issuers only)"],
    ["institution.placements.manage", "Manage campus drives, internships and placement outcomes"],
    ["institution.reports.view", "View training outcome reports"],
  ]),
  ...def("Billing", [["institution.billing.manage", "Manage plan and invoices"]]),
] as const satisfies readonly PermissionDef[];

export type PlatformPermission = (typeof PLATFORM_PERMISSIONS)[number]["key"];
export type EmployerPermission = (typeof EMPLOYER_PERMISSIONS)[number]["key"];
export type PartnerPermission = (typeof PARTNER_PERMISSIONS)[number]["key"];
export type InstitutionPermission = (typeof INSTITUTION_PERMISSIONS)[number]["key"];
export type OrgPermission = EmployerPermission | PartnerPermission | InstitutionPermission;
export type Permission = PlatformPermission | OrgPermission;

export const PERMISSIONS_BY_SCOPE: Record<RoleScope, readonly PermissionDef[]> = {
  platform: PLATFORM_PERMISSIONS,
  employer: EMPLOYER_PERMISSIONS,
  recruitment_partner: PARTNER_PERMISSIONS,
  institution: INSTITUTION_PERMISSIONS,
};

export type OrgPermissionFor<T extends OrgType> = T extends "employer"
  ? EmployerPermission
  : T extends "recruitment_partner"
    ? PartnerPermission
    : InstitutionPermission;

const keys = <T extends readonly PermissionDef[]>(list: T) => list.map((p) => p.key);
const allPlatform = keys(PLATFORM_PERMISSIONS) as PlatformPermission[];
const without = (list: string[], remove: string[]) => list.filter((p) => !remove.includes(p));

export type DefaultRole = { scope: RoleScope; key: string; name: string; description: string; permissions: string[] };

export const SUPER_ADMIN_ROLE_KEY = "super_admin";
export const ORG_OWNER_ROLE_KEY = "owner";

export const DEFAULT_ROLES: DefaultRole[] = [
  // ---------------- Venkat Sai staff ----------------
  { scope: "platform", key: SUPER_ADMIN_ROLE_KEY, name: "Super Admin", description: "Full control of the platform, including roles and security.", permissions: allPlatform },
  {
    scope: "platform",
    key: "administrator",
    name: "Administrator",
    description: "Runs day-to-day operations across every module (cannot change roles or security policy).",
    permissions: without(allPlatform, ["users.roles", "settings.roles", "settings.security"]),
  },
  {
    scope: "platform",
    key: "operations_manager",
    name: "Operations Manager",
    description: "Recruitment operations, verification and approvals.",
    permissions: [
      "dashboard.view", "users.view", "orgs.view", "orgs.manage", "orgs.verify", "jobs.view", "jobs.manage", "jobs.approve", "jobs.feature",
      "candidates.view", "candidates.manage", "candidates.view_contact", "candidates.view_documents", "candidates.verify",
      "recruitment.view", "recruitment.manage", "recruitment.assessments", "recruitment.mobilisation",
      "requirements.view", "requirements.manage", "leads.view", "leads.manage", "partners.view", "partners.manage", "partners.assign",
      "training.view", "approvals.view", "approvals.decide", "approvals.escalate", "support.view", "analytics.view",
    ],
  },
  {
    scope: "platform",
    key: "recruiter",
    name: "Venkat Sai Recruiter",
    description: "Sources, screens and moves candidates through requirements.",
    permissions: [
      "dashboard.view", "jobs.view", "candidates.view", "candidates.manage", "candidates.view_contact", "recruitment.view", "recruitment.manage",
      "recruitment.assessments", "recruitment.mobilisation", "requirements.view", "partners.view", "approvals.view", "support.view",
    ],
  },
  {
    scope: "platform",
    key: "content_manager",
    name: "Content Manager",
    description: "Maintains the public website, media library and announcements.",
    permissions: ["dashboard.view", "content.view", "content.edit", "content.publish", "media.manage", "announcements.manage", "metrics.public_manage", "approvals.view", "approvals.decide", "analytics.view"],
  },
  {
    scope: "platform",
    key: "finance",
    name: "Finance",
    description: "Plans, invoices, payments, refunds and partner settlements.",
    permissions: ["dashboard.view", "orgs.view", "commercial.view", "commercial.plans", "commercial.invoices", "commercial.payments", "commercial.refunds", "commercial.reports", "partners.settlements", "approvals.view", "approvals.decide", "support.view"],
  },
  {
    scope: "platform",
    key: "support_agent",
    name: "Support Agent",
    description: "Helpdesk for candidates, employers, partners and institutions.",
    permissions: ["dashboard.view", "users.view", "orgs.view", "candidates.view", "jobs.view", "support.view", "support.manage", "notifications.logs"],
  },
  {
    scope: "platform",
    key: "compliance_officer",
    name: "Compliance & Grievance Officer",
    description: "Privacy requests, grievances, verification oversight and audit.",
    permissions: ["dashboard.view", "users.view", "orgs.view", "orgs.verify", "candidates.view", "partners.view", "approvals.view", "approvals.decide", "support.view", "support.grievances", "privacy.requests", "privacy.consents", "audit.view", "analytics.view"],
  },
  {
    scope: "platform",
    key: "training_coordinator",
    name: "Training Coordinator",
    description: "Courses, assessment centre and Venkat Sai certificates.",
    permissions: ["dashboard.view", "candidates.view", "training.view", "training.manage", "training.certificates", "recruitment.assessments", "approvals.view", "approvals.decide"],
  },
  {
    scope: "platform",
    key: "analyst",
    name: "Analyst",
    description: "Read-only analytics and reporting.",
    permissions: ["dashboard.view", "analytics.view", "analytics.export", "commercial.reports", "jobs.view", "recruitment.view"],
  },

  // ---------------- Employer members ----------------
  { scope: "employer", key: ORG_OWNER_ROLE_KEY, name: "Owner", description: "Full access, including team and billing.", permissions: keys(EMPLOYER_PERMISSIONS) },
  { scope: "employer", key: "admin", name: "Admin", description: "Full access except ownership transfer.", permissions: keys(EMPLOYER_PERMISSIONS) },
  {
    scope: "employer",
    key: "hr_manager",
    name: "HR Manager",
    description: "Runs hiring end-to-end.",
    permissions: ["employer.dashboard", "employer.jobs.view", "employer.jobs.manage", "employer.requirements.manage", "employer.candidates.search", "employer.candidates.unlock", "employer.candidates.lists", "employer.pipeline.view", "employer.pipeline.manage", "employer.interviews.manage", "employer.offers.manage", "employer.reports.view"],
  },
  {
    scope: "employer",
    key: "recruiter",
    name: "Recruiter",
    description: "Sources and screens candidates.",
    permissions: ["employer.dashboard", "employer.jobs.view", "employer.jobs.manage", "employer.candidates.search", "employer.candidates.lists", "employer.pipeline.view", "employer.pipeline.manage", "employer.interviews.manage"],
  },
  {
    scope: "employer",
    key: "hiring_manager",
    name: "Hiring Manager",
    description: "Reviews shortlisted candidates and gives interview feedback.",
    permissions: ["employer.dashboard", "employer.jobs.view", "employer.pipeline.view", "employer.pipeline.manage", "employer.interviews.manage"],
  },
  { scope: "employer", key: "finance", name: "Finance User", description: "Billing and invoices.", permissions: ["employer.dashboard", "employer.billing.view", "employer.billing.manage"] },
  { scope: "employer", key: "viewer", name: "Read-only Stakeholder", description: "Views progress and reports.", permissions: ["employer.dashboard", "employer.jobs.view", "employer.pipeline.view", "employer.reports.view"] },

  // ---------------- Recruitment partner members ----------------
  { scope: "recruitment_partner", key: ORG_OWNER_ROLE_KEY, name: "Owner", description: "Full access.", permissions: keys(PARTNER_PERMISSIONS) },
  { scope: "recruitment_partner", key: "admin", name: "Admin", description: "Full access except ownership transfer.", permissions: keys(PARTNER_PERMISSIONS) },
  {
    scope: "recruitment_partner",
    key: "recruiter",
    name: "Recruiter",
    description: "Works assigned requirements and submits candidates.",
    permissions: ["partner.dashboard", "partner.requirements.view", "partner.candidates.submit", "partner.submissions.view", "partner.documents.manage", "partner.messages"],
  },
  { scope: "recruitment_partner", key: "viewer", name: "Viewer", description: "Read-only.", permissions: ["partner.dashboard", "partner.requirements.view", "partner.submissions.view", "partner.performance.view"] },

  // ---------------- Institution members ----------------
  { scope: "institution", key: ORG_OWNER_ROLE_KEY, name: "Owner", description: "Full access.", permissions: keys(INSTITUTION_PERMISSIONS) },
  { scope: "institution", key: "admin", name: "Admin", description: "Full access except ownership transfer.", permissions: keys(INSTITUTION_PERMISSIONS) },
  {
    scope: "institution",
    key: "coordinator",
    name: "Training / Placement Coordinator",
    description: "Courses, batches, students, assessments and placements.",
    permissions: ["institution.dashboard", "institution.courses.manage", "institution.batches.manage", "institution.students.manage", "institution.assessments.manage", "institution.placements.manage", "institution.reports.view"],
  },
  { scope: "institution", key: "instructor", name: "Instructor", description: "Attendance and assessment scores for assigned batches.", permissions: ["institution.dashboard", "institution.students.manage", "institution.assessments.manage"] },
  { scope: "institution", key: "viewer", name: "Viewer", description: "Read-only.", permissions: ["institution.dashboard", "institution.reports.view"] },
];
