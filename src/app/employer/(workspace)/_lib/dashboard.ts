import {
  BadgeCheck,
  BarChart3,
  Briefcase,
  Building2,
  CalendarClock,
  CircleHelp,
  ClipboardList,
  CreditCard,
  FolderKanban,
  HardHat,
  KanbanSquare,
  LifeBuoy,
  Megaphone,
  MessageSquare,
  Plane,
  PlaneTakeoff,
  Search,
  UserCheck,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import type { ChartDatum, ChecklistItem, DashboardAction, QuickActionItem, StatTileTone } from "@/components/dashboard";
import type { EmployerPermission } from "@/config/permissions";
import type { OrgStatus } from "@/db/schema/_constants";
import { EMPLOYER_PORTAL_BASE, portalForEmployerKind, type EmployerKind, type EmployerPortal } from "@/modules/organizations/employer-kind";
import { utcToZonedLocal, zonedLocalToUtc } from "@/modules/recruitment/timezone";
import { PIPELINE_COLUMNS, type PipelineColumnKey } from "@/modules/recruitment/workflow";

/**
 * Company Portal / Travel Agency Portal dashboard rules (pure and client-safe, unit tested): wording by employer
 * kind, which buttons and tiles a member sees, the set-up checklist, the verification next step, the to-do list and
 * the chart series. The page passes real counts from the database; nothing here invents a number.
 *
 * Links are built in the member's own portal (/employer for a company, /agency for a travel agency) so a click
 * never bounces through the /agency vs /employer redirect.
 */

type Permissions = ReadonlySet<string> | readonly string[];
type PermissionRule = EmployerPermission | readonly EmployerPermission[];

const hasOne = (permissions: Permissions, key: string): boolean =>
  Array.isArray(permissions) ? permissions.includes(key) : (permissions as ReadonlySet<string>).has(key);

/** No rule: every member. A list: any one of them. */
export function canUse(permissions: Permissions, rule: PermissionRule | undefined): boolean {
  if (rule === undefined) return true;
  if (typeof rule === "string") return hasOne(permissions, rule);
  return rule.some((key) => hasOne(permissions, key));
}

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-IN")} ${n === 1 ? one : many}`;

// ---------------------------------------------------------------------------
// Wording
// ---------------------------------------------------------------------------

export type EmployerDashboardCopy = {
  portal: EmployerPortal;
  /** "/employer" or "/agency". */
  base: string;
  noun: "company" | "agency";
  portalName: string;
  overviewTitle: string;
  overviewDescription: string;
  /** "candidates" (a company hiring for itself) or "workers" (an agency supplying its clients). */
  people: "candidates" | "workers";
  pipelineTitle: string;
  pipelineDescription: string;
  requestsTitle: string;
  requestsDescription: string;
  requestsEmptyTitle: string;
  requestsEmptyDescription: string;
  bulkTitle: string;
  bulkDescription: string;
};

export function dashboardCopy(kind: EmployerKind): EmployerDashboardCopy {
  const portal = portalForEmployerKind(kind);
  const base = EMPLOYER_PORTAL_BASE[portal];
  if (kind === "travel_agency") {
    return {
      portal,
      base,
      noun: "agency",
      portalName: "Travel Agency Portal",
      overviewTitle: "Manpower overview",
      overviewDescription: "Requests for your clients, the workers we put forward and who has been supplied.",
      people: "workers",
      pipelineTitle: "Your workers by stage",
      pipelineDescription: "Workers put forward for your clients' requirements, at each stage.",
      requestsTitle: "Manpower requests",
      requestsDescription: "The latest requests you sent for your clients.",
      requestsEmptyTitle: "No manpower requests yet",
      requestsEmptyDescription: "Send the trades, number of workers, salary and demand letter. Our team sources, trains and tests the workers.",
      bulkTitle: "Large manpower order?",
      bulkDescription: "For big or urgent orders from your clients, talk to Prasad directly. He handles bulk manpower for travel agencies.",
    };
  }
  return {
    portal,
    base,
    noun: "company",
    portalName: "Company Portal",
    overviewTitle: "Hiring overview",
    overviewDescription: "Your manpower requests, candidates, interviews, offers and people who joined.",
    people: "candidates",
    pipelineTitle: "Candidates by stage",
    pipelineDescription: "Candidates shared with you across your jobs, at each stage.",
    requestsTitle: "Manpower requests",
    requestsDescription: "The latest requests your company sent.",
    requestsEmptyTitle: "No manpower requests yet",
    requestsEmptyDescription: "Tell us the trades, how many people you need and by when. Our team sources, screens and tests candidates for you.",
    bulkTitle: "Large manpower order?",
    bulkDescription: "Hiring a big team or need people urgently? Talk to Prasad directly. He handles bulk manpower for companies.",
  };
}

// ---------------------------------------------------------------------------
// Quick actions and header pills
// ---------------------------------------------------------------------------

/** Real counts shown as badges on the quick actions (0 or null hides a badge). */
export type EmployerActionBadges = {
  draftRequirements?: number | null;
  interviewsThisWeek?: number | null;
  draftOffers?: number | null;
  unpaidInvoices?: number | null;
  pendingInvitations?: number | null;
  unreadMessages?: number | null;
  openSupportRequests?: number | null;
};

type ActionDef = {
  key: string;
  /** Path under the portal base ("" is the dashboard). */
  path: string;
  label: string | Record<EmployerKind, string>;
  /** Shorter label for the header pill (defaults to `label`). */
  short?: string | Record<EmployerKind, string>;
  hint: string | Record<EmployerKind, string>;
  icon: LucideIcon | Record<EmployerKind, LucideIcon>;
  permission?: PermissionRule;
  /** Only for these kinds (default both). The Travel Agency menu has no jobs, talent search, lists or reports. */
  kinds?: readonly EmployerKind[];
  badge?: keyof EmployerActionBadges;
  badgeLabel?: string;
};

const COMPANY_ONLY: readonly EmployerKind[] = ["direct_company"];

/** Every main button of the employer workspace, in working order. Mirrors the portal menus in src/config/navigation.ts. */
export const EMPLOYER_ACTIONS: readonly ActionDef[] = [
  {
    key: "request",
    path: "/requirements/new",
    label: "Request manpower",
    hint: { direct_company: "Trades, headcount and joining date", travel_agency: "For a client: trades, workers, demand letter" },
    icon: HardHat,
    permission: "employer.requirements.manage",
  },
  {
    key: "requests",
    path: "/requirements",
    label: "Manpower requests",
    hint: "Status of every request",
    icon: ClipboardList,
    permission: "employer.requirements.manage",
    badge: "draftRequirements",
    badgeLabel: "drafts to send",
  },
  { key: "job", path: "/jobs/new", label: "Post a job", hint: "We review it before it goes live", icon: Briefcase, permission: "employer.jobs.manage", kinds: COMPANY_ONLY },
  { key: "search", path: "/candidates", label: "Search talent", hint: "Skilled workers by trade and country", icon: Search, permission: "employer.candidates.search", kinds: COMPANY_ONLY },
  { key: "lists", path: "/lists", label: "Talent lists", hint: "People you saved for later", icon: FolderKanban, permission: "employer.candidates.lists", kinds: COMPANY_ONLY },
  {
    key: "pipeline",
    path: "/pipeline",
    label: { direct_company: "Pipeline", travel_agency: "Candidates & pipeline" },
    short: { direct_company: "Pipeline", travel_agency: "Candidates" },
    hint: { direct_company: "Move candidates through the stages", travel_agency: "Workers we put forward, by stage" },
    icon: KanbanSquare,
    permission: "employer.pipeline.view",
  },
  {
    key: "interviews",
    path: "/interviews",
    label: "Interviews",
    hint: "Schedule, join and give feedback",
    icon: CalendarClock,
    permission: "employer.interviews.manage",
    badge: "interviewsThisWeek",
    badgeLabel: "this week",
  },
  {
    key: "offers",
    path: "/offers",
    label: { direct_company: "Offers & placements", travel_agency: "Deployment & mobilisation" },
    short: { direct_company: "Offers", travel_agency: "Deployment" },
    hint: { direct_company: "Offers sent and people who joined", travel_agency: "Selected workers on their way" },
    icon: { direct_company: BadgeCheck, travel_agency: Plane },
    permission: "employer.offers.manage",
    badge: "draftOffers",
    badgeLabel: "offer drafts",
  },
  { key: "reports", path: "/reports", label: "Reports", hint: "Hiring numbers over time", icon: BarChart3, permission: "employer.reports.view", kinds: COMPANY_ONLY },
  {
    key: "billing",
    path: "/billing",
    label: "Invoices & billing",
    hint: "Worker invoices, plan and payments",
    icon: CreditCard,
    permission: "employer.billing.view",
    badge: "unpaidInvoices",
    badgeLabel: "unpaid",
  },
  {
    key: "team",
    path: "/team",
    label: "Team",
    hint: "Invite colleagues, set roles",
    icon: Users,
    permission: "employer.team.manage",
    badge: "pendingInvitations",
    badgeLabel: "invitations pending",
  },
  {
    key: "profile",
    path: "/company",
    label: { direct_company: "Company profile", travel_agency: "Agency profile" },
    hint: "Details, documents, verification",
    icon: Building2,
    permission: "employer.company.manage",
  },
  { key: "announcements", path: "/announcements", label: "Announcements", hint: "News on your public page", icon: Megaphone, permission: "employer.company.manage", kinds: COMPANY_ONLY },
  { key: "messages", path: "/messages", label: "Messages", hint: "Talk to the Venkat Sai team", icon: MessageSquare, badge: "unreadMessages", badgeLabel: "unread" },
  { key: "support", path: "/support", label: "Support", hint: "Ask for help, track requests", icon: LifeBuoy, badge: "openSupportRequests", badgeLabel: "open" },
  { key: "help", path: "/help", label: "How to use", hint: "Step-by-step guide", icon: CircleHelp },
];

function pick<T>(value: T | Record<EmployerKind, T>, kind: EmployerKind): T {
  if (typeof value === "object" && value !== null && "direct_company" in value && "travel_agency" in value) return (value as Record<EmployerKind, T>)[kind];
  return value as T;
}

function visibleActions(kind: EmployerKind, permissions: Permissions): ActionDef[] {
  return EMPLOYER_ACTIONS.filter((a) => (!a.kinds || a.kinds.includes(kind)) && canUse(permissions, a.permission));
}

/** Every button this member may use, in their own portal, with real count badges. */
export function employerQuickActions(kind: EmployerKind, permissions: Permissions, badges: EmployerActionBadges = {}): QuickActionItem[] {
  const base = EMPLOYER_PORTAL_BASE[portalForEmployerKind(kind)];
  return visibleActions(kind, permissions).map((a) => ({
    label: pick(a.label, kind),
    href: `${base}${a.path}`,
    icon: pick(a.icon, kind),
    hint: pick(a.hint, kind),
    badge: a.badge ? (badges[a.badge] ?? null) : null,
    badgeLabel: a.badgeLabel,
  }));
}

const HEADER_ORDER: Record<EmployerKind, readonly string[]> = {
  direct_company: ["request", "job", "search", "pipeline", "interviews", "offers", "billing", "messages"],
  travel_agency: ["request", "pipeline", "offers", "interviews", "billing", "messages"],
};

/** Up to three header pills: the first actions in the kind's order this member may use. */
export function employerHeaderActions(kind: EmployerKind, permissions: Permissions): DashboardAction[] {
  const base = EMPLOYER_PORTAL_BASE[portalForEmployerKind(kind)];
  const byKey = new Map(visibleActions(kind, permissions).map((a) => [a.key, a]));
  return HEADER_ORDER[kind]
    .map((key) => byKey.get(key))
    .filter((a): a is ActionDef => Boolean(a))
    .slice(0, 3)
    .map((a) => ({ label: pick(a.short ?? a.label, kind), href: `${base}${a.path}`, icon: pick(a.icon, kind) }));
}

// ---------------------------------------------------------------------------
// Headline tiles
// ---------------------------------------------------------------------------

/** Real figures from the database. A null section is not available (failed to load); the tile then shows "—". */
export type EmployerDashboardFacts = {
  requirements: { open: number; openPositions: number; drafts: number; total: number } | null;
  pipeline: { active: number; shortlisted: number; atInterview: number; offer: number; joined: number } | null;
  interviewsThisWeek: number | null;
  offers: { awaitingReply: number; accepted: number; drafts: number } | null;
  placements: { deployed: number; onTheWay: number } | null;
  jobs: { live: number; drafts: number; inReview: number; changesRequested: number; total: number } | null;
  billing: { amountDue: string | null; unpaidInvoices: number } | null;
  team: { members: number; pendingInvitations: number } | null;
};

export type StatTileSpec = {
  key: string;
  label: string;
  value: number | string | null;
  href: string | null;
  hint?: string;
  tone?: StatTileTone;
  icon: LucideIcon;
};

/** The headline tiles this member may see, each linking to the page where they act on it. */
export function employerStatTiles(kind: EmployerKind, permissions: Permissions, facts: EmployerDashboardFacts): StatTileSpec[] {
  const base = EMPLOYER_PORTAL_BASE[portalForEmployerKind(kind)];
  const agency = kind === "travel_agency";
  const can = (rule: PermissionRule) => canUse(permissions, rule);
  const tiles: StatTileSpec[] = [];
  const { requirements: req, pipeline, offers, placements, jobs, billing, team } = facts;

  if (can(["employer.requirements.manage", "employer.dashboard"])) {
    tiles.push({
      key: "requests",
      label: "Open manpower requests",
      value: req ? req.open : null,
      href: can("employer.requirements.manage") ? `${base}/requirements` : null,
      hint: req ? (req.openPositions > 0 ? `${plural(req.openPositions, "position")} to fill` : "Nothing waiting") : undefined,
      icon: HardHat,
    });
  }
  if (can("employer.pipeline.view")) {
    tiles.push({
      key: "pipeline",
      label: agency ? "Your workers in the pipeline" : "Candidates in your pipeline",
      value: pipeline ? pipeline.active : null,
      href: `${base}/pipeline`,
      hint: pipeline ? `${pipeline.shortlisted.toLocaleString("en-IN")} shortlisted` : undefined,
      icon: UserCheck,
    });
  }
  if (can(["employer.interviews.manage", "employer.pipeline.view"])) {
    tiles.push({
      key: "interviews",
      label: "Interviews this week",
      value: facts.interviewsThisWeek,
      href: `${base}/interviews?view=week`,
      hint: "Monday to Sunday",
      icon: CalendarClock,
    });
  }
  if (can("employer.offers.manage")) {
    tiles.push({
      key: "offers",
      label: "Offers waiting for a reply",
      value: offers ? offers.awaitingReply : null,
      href: `${base}/offers`,
      hint: offers ? `${offers.accepted.toLocaleString("en-IN")} accepted` : undefined,
      icon: BadgeCheck,
    });
  }
  if (can(["employer.offers.manage", "employer.pipeline.view"])) {
    tiles.push({
      key: "deployed",
      label: agency ? "Workers supplied" : "Workers deployed",
      value: placements ? placements.deployed : null,
      href: `${base}/offers?tab=placements`,
      hint: agency || !placements ? "Joined at the work site" : placements.onTheWay > 0 ? `${placements.onTheWay.toLocaleString("en-IN")} getting ready to travel` : "Joined at the work site",
      tone: "positive",
      icon: Plane,
    });
    if (agency) {
      tiles.push({
        key: "on-the-way",
        label: "Getting ready to travel",
        value: placements ? placements.onTheWay : null,
        href: `${base}/offers?tab=placements`,
        hint: "Visa, ticket or joining in progress",
        icon: PlaneTakeoff,
      });
    }
  }
  if (!agency && can("employer.jobs.view")) {
    const hint = jobs ? [jobs.inReview ? `${jobs.inReview} in review` : null, jobs.drafts ? plural(jobs.drafts, "draft") : null].filter(Boolean).join(" · ") : "";
    tiles.push({ key: "jobs", label: "Live jobs", value: jobs ? jobs.live : null, href: `${base}/jobs`, hint: hint || "Published on Venkat Sai", icon: Briefcase });
  }
  if (can("employer.billing.view")) {
    tiles.push({
      key: "billing",
      label: "Amount due",
      value: billing ? (billing.amountDue ?? "Nothing due") : null,
      href: `${base}/billing`,
      hint: billing ? (billing.unpaidInvoices > 0 ? plural(billing.unpaidInvoices, "unpaid invoice") : "No unpaid invoices") : undefined,
      tone: billing?.amountDue ? "attention" : "default",
      icon: Wallet,
    });
  }
  tiles.push({
    key: "team",
    label: "Team members",
    value: team ? team.members : null,
    href: can("employer.team.manage") ? `${base}/team` : null,
    hint: team ? (team.pendingInvitations > 0 ? `${plural(team.pendingInvitations, "invitation")} pending` : "Active in this workspace") : undefined,
    icon: Users,
  });
  return tiles;
}

/** True once the workspace has real activity beyond drafts (then tiles carry meaning even before verification). */
export function hasDashboardActivity(facts: EmployerDashboardFacts): boolean {
  return Boolean(
    (facts.requirements?.total ?? 0) - (facts.requirements?.drafts ?? 0) > 0 ||
      (facts.pipeline?.active ?? 0) + (facts.pipeline?.joined ?? 0) > 0 ||
      (facts.jobs?.total ?? 0) - (facts.jobs?.drafts ?? 0) > 0 ||
      (facts.placements?.deployed ?? 0) + (facts.placements?.onTheWay ?? 0) > 0 ||
      (facts.billing?.unpaidInvoices ?? 0) > 0 ||
      (facts.interviewsThisWeek ?? 0) > 0,
  );
}

// ---------------------------------------------------------------------------
// Set-up checklist
// ---------------------------------------------------------------------------

export type EmployerSetupFacts = {
  orgStatus: OrgStatus | string;
  hasDetails: boolean;
  hasBranding: boolean;
  documentsMet: boolean;
  memberCount: number;
  pendingInvitationCount: number;
  requirementCount: number;
  jobCount: number;
};

const SUBMITTED = new Set(["pending", "under_review", "verified"]);

/** Set-up steps, only those this member can do. Each links to the page where it is done. */
export function employerSetupChecklist(kind: EmployerKind, permissions: Permissions, facts: EmployerSetupFacts): ChecklistItem[] {
  const base = EMPLOYER_PORTAL_BASE[portalForEmployerKind(kind)];
  const noun = kind === "travel_agency" ? "agency" : "company";
  const submitted = SUBMITTED.has(facts.orgStatus);
  const items: (ChecklistItem & { permission: PermissionRule })[] = [
    {
      id: "details",
      label: `Complete your ${noun} details`,
      description: "Registered address, city and an official email or phone.",
      done: facts.hasDetails,
      href: `${base}/company`,
      permission: "employer.company.manage",
    },
    {
      id: "branding",
      label: "Add your logo and a short description",
      description: `Candidates and our team see it on your ${noun} page.`,
      done: facts.hasBranding,
      href: `${base}/company#branding`,
      permission: "employer.company.manage",
    },
    {
      id: "documents",
      label: kind === "travel_agency" ? "Upload your licence and registration documents" : "Upload your registration documents",
      description: "Private to the Venkat Sai verification team.",
      done: facts.documentsMet || submitted,
      href: `${base}/company/verification`,
      permission: "employer.company.manage",
    },
    {
      id: "verification",
      label: facts.orgStatus === "verified" ? "Verified by Venkat Sai" : `Submit your ${noun} for verification`,
      description: submitted && facts.orgStatus !== "verified" ? "Submitted. Our team is checking your documents." : "Verification unlocks every feature.",
      done: submitted,
      href: `${base}/company/verification`,
      permission: "employer.company.manage",
    },
    {
      id: "team",
      label: "Invite your team",
      description: "Give each colleague the right role.",
      done: facts.memberCount > 1 || facts.pendingInvitationCount > 0,
      href: `${base}/team`,
      permission: "employer.team.manage",
    },
    kind === "travel_agency"
      ? {
          id: "first-request",
          label: "Send your first manpower request",
          description: "Trades, number of workers, salary and the demand letter.",
          done: facts.requirementCount > 0,
          href: `${base}/requirements/new`,
          permission: "employer.requirements.manage",
        }
      : {
          id: "first-request",
          label: "Request manpower or post a job",
          description: "Tell us who you need. We source, screen and test the people.",
          done: facts.requirementCount + facts.jobCount > 0,
          href: canUse(permissions, "employer.requirements.manage") ? `${base}/requirements/new` : `${base}/jobs/new`,
          permission: ["employer.requirements.manage", "employer.jobs.manage"],
        },
  ];
  return items.filter((i) => canUse(permissions, i.permission)).map((i) => ({ id: i.id, label: i.label, description: i.description, done: i.done, href: i.href }));
}

// ---------------------------------------------------------------------------
// Verification next step (organisations that are not verified yet)
// ---------------------------------------------------------------------------

export type VerificationStepState = "done" | "current" | "todo";
export type VerificationPlan = {
  tone: "info" | "warning" | "danger";
  title: string;
  description: string;
  steps: { id: string; label: string; state: VerificationStepState }[];
  /** Main button (null when this member cannot act on verification). */
  action: DashboardAction | null;
  /** What the member can already do meanwhile. */
  secondary: DashboardAction | null;
};

/**
 * The clear next step for an organisation that is not verified, shown instead of a wall of empty tiles.
 * Null for verified organisations.
 */
export function verificationPlan(kind: EmployerKind, permissions: Permissions, facts: Pick<EmployerSetupFacts, "orgStatus" | "hasDetails" | "documentsMet">): VerificationPlan | null {
  const status = facts.orgStatus;
  if (status === "verified") return null;
  const base = EMPLOYER_PORTAL_BASE[portalForEmployerKind(kind)];
  const noun = kind === "travel_agency" ? "agency" : "company";
  const canManage = canUse(permissions, "employer.company.manage");
  const verificationHref = `${base}/company/verification`;
  const submitted = status === "pending" || status === "under_review";
  const detailsDone = facts.hasDetails || submitted;
  const documentsDone = facts.documentsMet || submitted;

  const state = (done: boolean, current: boolean): VerificationStepState => (done ? "done" : current ? "current" : "todo");
  const steps = [
    { id: "details", label: `${noun === "agency" ? "Agency" : "Company"} details`, state: state(detailsDone, !detailsDone) },
    { id: "documents", label: "Documents", state: state(documentsDone, detailsDone && !documentsDone) },
    { id: "review", label: "Review by Venkat Sai", state: state(false, detailsDone && documentsDone) },
    { id: "verified", label: "Verified", state: "todo" as VerificationStepState },
  ];

  const meanwhile: DashboardAction | null = canUse(permissions, "employer.requirements.manage")
    ? { label: "Request manpower", href: `${base}/requirements/new` }
    : { label: "Message our team", href: `${base}/messages` };
  const askOwner = `Ask a workspace owner to complete it, or message our team.`;

  if (submitted) {
    return {
      tone: "info",
      title: status === "under_review" ? `We are checking your ${noun}` : "Verification request received",
      description: `Nothing more is needed from you right now. We will contact you if we need anything else. Meanwhile you can already send manpower requests.`,
      steps,
      action: canManage ? { label: "View verification status", href: verificationHref } : null,
      secondary: meanwhile,
    };
  }
  if (status === "rejected") {
    return {
      tone: "danger",
      title: "Verification needs changes",
      description: `See the reasons on your verification page, fix the details and submit again.${canManage ? "" : ` ${askOwner}`}`,
      steps,
      action: canManage ? { label: "Review and resubmit", href: verificationHref } : null,
      secondary: { label: "Message our team", href: `${base}/messages` },
    };
  }
  if (status === "expired") {
    return {
      tone: "warning",
      title: "Renew your verification",
      description: `Your ${noun}'s verification is no longer current. Upload current documents to keep every feature.${canManage ? "" : ` ${askOwner}`}`,
      steps,
      action: canManage ? { label: "Renew verification", href: verificationHref } : null,
      secondary: meanwhile,
    };
  }
  if (status === "suspended") {
    return {
      tone: "danger",
      title: `Your ${noun} account is suspended`,
      description: "Contact Venkat Sai support to find out what is needed to restore access.",
      steps,
      action: { label: "Contact support", href: `${base}/support` },
      secondary: canManage ? { label: "Verification details", href: verificationHref } : null,
    };
  }
  // draft (not submitted yet) or any status we do not know.
  const next = !detailsDone
    ? { label: `Complete ${noun} details`, href: `${base}/company` }
    : !documentsDone
      ? { label: "Upload documents", href: verificationHref }
      : { label: "Submit for verification", href: verificationHref };
  return {
    tone: "warning",
    title: `Get your ${noun} verified`,
    description: `Venkat Sai checks every ${noun} before it can use every feature. It takes a few minutes: your details, your documents, then we review them.${canManage ? "" : ` ${askOwner}`}`,
    steps,
    action: canManage ? next : null,
    secondary: meanwhile,
  };
}

// ---------------------------------------------------------------------------
// To-do list
// ---------------------------------------------------------------------------

export type EmployerTodo = { id: string; title: string; meta: string; href: string };

export type EmployerTodoFacts = {
  orgStatus: OrgStatus | string;
  verificationDaysLeft: number | null;
  jobs: { drafts: number; changesRequested: number } | null;
  draftRequirements: number;
  pipeline: { atInterview: number; offer: number } | null;
  draftOffers: number;
  unpaidInvoices: number;
  unreadMessages: number;
};

/** Things waiting for this member, each linking to where it is done. Only what their role can act on. */
export function employerTodos(kind: EmployerKind, permissions: Permissions, facts: EmployerTodoFacts): EmployerTodo[] {
  const base = EMPLOYER_PORTAL_BASE[portalForEmployerKind(kind)];
  const can = (rule: PermissionRule) => canUse(permissions, rule);
  const out: EmployerTodo[] = [];
  const noun = kind === "travel_agency" ? "agency" : "company";

  if (can("employer.company.manage") && ["draft", "rejected", "expired"].includes(facts.orgStatus)) {
    out.push({ id: "verify", title: facts.orgStatus === "expired" ? "Renew your verification" : `Submit your ${noun} for verification`, meta: "Unlocks every feature", href: `${base}/company/verification` });
  }
  if (can("employer.company.manage") && facts.verificationDaysLeft !== null && facts.verificationDaysLeft <= 30) {
    out.push({ id: "renew", title: `Verification ends in ${plural(Math.max(0, facts.verificationDaysLeft), "day")}`, meta: "Upload current documents to renew", href: `${base}/company/verification` });
  }
  if (can("employer.requirements.manage") && facts.draftRequirements > 0) {
    out.push({ id: "req-draft", title: `${plural(facts.draftRequirements, "draft manpower request")} to send`, meta: "We start sourcing once you send it", href: `${base}/requirements?status=draft` });
  }
  if (kind === "direct_company" && can("employer.jobs.view") && facts.jobs?.changesRequested) {
    out.push({ id: "jobs-changes", title: `${plural(facts.jobs.changesRequested, "job")} with changes requested`, meta: "Update and send it back for review", href: `${base}/jobs?status=changes_requested` });
  }
  if (kind === "direct_company" && can("employer.jobs.manage") && facts.jobs?.drafts) {
    out.push({ id: "jobs-draft", title: `${plural(facts.jobs.drafts, "draft job")} not sent for review`, meta: "Jobs go live after our review", href: `${base}/jobs?status=draft` });
  }
  if (can("employer.interviews.manage") && facts.pipeline?.atInterview) {
    const who = kind === "travel_agency" ? "worker" : "candidate";
    out.push({ id: "interviews", title: `${plural(facts.pipeline.atInterview, who)} at the interview stage`, meta: "Schedule, attend or give feedback", href: `${base}/interviews` });
  }
  if (can("employer.offers.manage") && facts.draftOffers > 0) {
    out.push({ id: "offer-drafts", title: `${plural(facts.draftOffers, "offer draft")} not sent`, meta: "Send it so the candidate can reply", href: `${base}/offers?status=draft` });
  }
  if (can("employer.billing.view") && facts.unpaidInvoices > 0) {
    out.push({ id: "invoices", title: `${plural(facts.unpaidInvoices, "unpaid invoice")}`, meta: "Download or pay from billing", href: `${base}/billing/invoices` });
  }
  if (facts.unreadMessages > 0) {
    out.push({ id: "messages", title: `${plural(facts.unreadMessages, "conversation")} with unread messages`, meta: "From the Venkat Sai team", href: `${base}/messages` });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Charts
// ---------------------------------------------------------------------------

/** Totals per pipeline column across the organisation's jobs. */
export function pipelineTotals(jobs: readonly { counts: Partial<Record<PipelineColumnKey, number>> }[]): Record<PipelineColumnKey, number> {
  const totals = Object.fromEntries(PIPELINE_COLUMNS.map((c) => [c.key, 0])) as Record<PipelineColumnKey, number>;
  for (const job of jobs) for (const column of PIPELINE_COLUMNS) totals[column.key] += job.counts[column.key] ?? 0;
  return totals;
}

/** Short axis labels so all nine stages fit under a half-width chart. */
const SHORT_STAGE_LABELS: Partial<Record<PipelineColumnKey, string>> = { client_interview: "Interview", documentation: "Documents", mobilisation: "Travel" };

/** Candidates at each open stage, in board order (closed / rejected left out). */
export function pipelineChartData(totals: Record<PipelineColumnKey, number>): ChartDatum[] {
  return PIPELINE_COLUMNS.filter((c) => c.key !== "closed").map((c) => ({ label: SHORT_STAGE_LABELS[c.key] ?? c.label, value: totals[c.key] ?? 0 }));
}

const REQUEST_GROUPS: readonly { label: string; statuses: readonly string[] }[] = [
  { label: "Draft", statuses: ["draft"] },
  { label: "In review", statuses: ["submitted", "under_review"] },
  { label: "Approved", statuses: ["approved"] },
  { label: "Sourcing", statuses: ["sourcing", "in_progress"] },
  { label: "Part filled", statuses: ["partially_filled"] },
  { label: "Filled", statuses: ["filled"] },
  { label: "On hold", statuses: ["on_hold"] },
];

/** Manpower requests grouped into plain stages (cancelled and closed left out). */
export function requestChartData(byStatus: Readonly<Record<string, number>>): ChartDatum[] {
  return REQUEST_GROUPS.map((g) => ({ label: g.label, value: g.statuses.reduce((sum, s) => sum + (byStatus[s] ?? 0), 0) }));
}

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

/** "AED 1,200.00 + ₹5,000.00": each currency kept apart (never summed across currencies); null when nothing is due. */
export function joinAmounts(amounts: readonly { amountMinor: number; currency: string }[], format: (amountMinor: number, currency: string) => string): string | null {
  const due = amounts.filter((a) => a.amountMinor > 0);
  if (!due.length) return null;
  return due.map((a) => format(a.amountMinor, a.currency)).join(" + ");
}

// ---------------------------------------------------------------------------
// Time
// ---------------------------------------------------------------------------

/** Monday 00:00 up to the next Monday 00:00 of the week containing `now`, in `timeZone` (same week as the interviews page). */
export function weekRange(now: Date, timeZone: string): { from: Date; to: Date } {
  const today = utcToZonedLocal(now, timeZone).slice(0, 10);
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  const monday = d.toISOString().slice(0, 10);
  d.setUTCDate(d.getUTCDate() + 7);
  const nextMonday = d.toISOString().slice(0, 10);
  return { from: zonedLocalToUtc(`${monday}T00:00`, timeZone), to: zonedLocalToUtc(`${nextMonday}T00:00`, timeZone) };
}
