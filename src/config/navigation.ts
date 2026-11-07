/**
 * Portal navigation (client-safe) — also the ROUTE CONTRACT for each portal:
 * every href listed here must exist. Items are filtered by permission in the portal shell.
 */
import {
  Activity,
  Award,
  BadgeCheck,
  BarChart3,
  Bell,
  Bookmark,
  BookOpen,
  Briefcase,
  Building2,
  CalendarClock,
  ClipboardCheck,
  ClipboardList,
  Coins,
  CreditCard,
  FileText,
  FolderKanban,
  Gauge,
  GraduationCap,
  Handshake,
  HardHat,
  Headset,
  Image as ImageIcon,
  Inbox,
  KanbanSquare,
  LayoutDashboard,
  LifeBuoy,
  ListChecks,
  Mail,
  Megaphone,
  MessageSquare,
  MousePointerClick,
  Newspaper,
  Plane,
  Receipt,
  ScrollText,
  Search,
  Settings,
  Shield,
  ShieldCheck,
  Sparkles,
  Target,
  UserCircle,
  UserCog,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
  /** Permission required to see the item (platform or organisation permission key). */
  permission?: string;
  /** i18n key (People Portal only), namespace "common". */
  i18nKey?: string;
  /** Match nested routes as active (default true). */
  matchNested?: boolean;
};

export type NavSection = { title?: string; items: NavItem[] };

export type PortalKey = "talent" | "employer" | "recruiter" | "institution" | "admin";

export const PORTAL_LABEL: Record<PortalKey, string> = {
  talent: "People Portal",
  employer: "Employer Portal",
  recruiter: "Partner Portal",
  institution: "Institution Portal",
  admin: "Command Centre",
};

export const PORTAL_HOME: Record<PortalKey, string> = {
  talent: "/talent",
  employer: "/employer",
  recruiter: "/recruiter",
  institution: "/institution",
  admin: "/admin",
};

export const NAVIGATION: Record<PortalKey, NavSection[]> = {
  talent: [
    {
      items: [
        { title: "Dashboard", href: "/talent", icon: LayoutDashboard, i18nKey: "nav.dashboard", matchNested: false },
        { title: "My profile", href: "/talent/profile", icon: UserCircle, i18nKey: "nav.profile" },
      ],
    },
    {
      title: "Opportunities",
      items: [
        { title: "Find jobs", href: "/talent/jobs", icon: Search, i18nKey: "nav.jobs" },
        { title: "Saved jobs", href: "/talent/saved", icon: Bookmark, i18nKey: "nav.saved" },
        { title: "Job alerts", href: "/talent/alerts", icon: Bell, i18nKey: "nav.alerts" },
        { title: "Applications", href: "/talent/applications", icon: ClipboardList, i18nKey: "nav.applications" },
        { title: "Interviews", href: "/talent/interviews", icon: CalendarClock, i18nKey: "nav.interviews" },
      ],
    },
    {
      title: "Skills & growth",
      items: [
        { title: "Training", href: "/talent/training", icon: GraduationCap, i18nKey: "nav.training" },
        { title: "Assessments", href: "/talent/assessments", icon: ClipboardCheck, i18nKey: "nav.assessments" },
        { title: "Certificates", href: "/talent/certificates", icon: Award, i18nKey: "nav.certificates" },
        { title: "Career services", href: "/talent/career", icon: Sparkles, i18nKey: "nav.career" },
      ],
    },
    {
      title: "Account",
      items: [
        { title: "Notifications", href: "/talent/notifications", icon: Bell, i18nKey: "nav.notifications" },
        { title: "Support", href: "/talent/support", icon: LifeBuoy, i18nKey: "nav.support" },
        { title: "Privacy & data", href: "/talent/privacy", icon: ShieldCheck, i18nKey: "nav.privacy" },
      ],
    },
  ],

  employer: [
    {
      items: [
        { title: "Dashboard", href: "/employer", icon: LayoutDashboard, permission: "employer.dashboard", matchNested: false },
        { title: "Jobs", href: "/employer/jobs", icon: Briefcase, permission: "employer.jobs.view" },
        { title: "Workforce requirements", href: "/employer/requirements", icon: HardHat, permission: "employer.requirements.manage" },
      ],
    },
    {
      title: "Talent",
      items: [
        { title: "Find candidates", href: "/employer/candidates", icon: Search, permission: "employer.candidates.search" },
        { title: "Talent lists", href: "/employer/lists", icon: FolderKanban, permission: "employer.candidates.lists" },
        { title: "Pipeline", href: "/employer/pipeline", icon: KanbanSquare, permission: "employer.pipeline.view" },
        { title: "Interviews", href: "/employer/interviews", icon: CalendarClock, permission: "employer.interviews.manage" },
        { title: "Offers & placements", href: "/employer/offers", icon: BadgeCheck, permission: "employer.offers.manage" },
        { title: "Reports", href: "/employer/reports", icon: BarChart3, permission: "employer.reports.view" },
      ],
    },
    {
      title: "Company",
      items: [
        { title: "Company profile", href: "/employer/company", icon: Building2, permission: "employer.company.manage" },
        { title: "Team", href: "/employer/team", icon: Users, permission: "employer.team.manage" },
        { title: "Billing", href: "/employer/billing", icon: CreditCard, permission: "employer.billing.view" },
        { title: "Messages", href: "/employer/messages", icon: MessageSquare },
        { title: "Support", href: "/employer/support", icon: LifeBuoy },
      ],
    },
  ],

  recruiter: [
    {
      items: [
        { title: "Dashboard", href: "/recruiter", icon: LayoutDashboard, permission: "partner.dashboard", matchNested: false },
        { title: "Assigned requirements", href: "/recruiter/requirements", icon: ClipboardList, permission: "partner.requirements.view" },
        { title: "Submissions", href: "/recruiter/submissions", icon: Inbox, permission: "partner.submissions.view" },
        { title: "My candidates", href: "/recruiter/candidates", icon: Users, permission: "partner.candidates.submit" },
        { title: "Interviews", href: "/recruiter/interviews", icon: CalendarClock, permission: "partner.submissions.view" },
        { title: "Documents", href: "/recruiter/documents", icon: FileText, permission: "partner.documents.manage" },
        { title: "Messages", href: "/recruiter/messages", icon: MessageSquare, permission: "partner.messages" },
      ],
    },
    {
      title: "Agency",
      items: [
        { title: "Performance", href: "/recruiter/performance", icon: Gauge, permission: "partner.performance.view" },
        { title: "Settlements", href: "/recruiter/settlements", icon: Wallet, permission: "partner.settlements.view" },
        { title: "Agency profile", href: "/recruiter/profile", icon: Building2, permission: "partner.profile.manage" },
        { title: "Team", href: "/recruiter/team", icon: Users, permission: "partner.team.manage" },
        { title: "Support", href: "/recruiter/support", icon: LifeBuoy },
      ],
    },
  ],

  institution: [
    {
      items: [
        { title: "Dashboard", href: "/institution", icon: LayoutDashboard, permission: "institution.dashboard", matchNested: false },
        { title: "Courses", href: "/institution/courses", icon: BookOpen, permission: "institution.courses.manage" },
        { title: "Batches", href: "/institution/batches", icon: CalendarClock, permission: "institution.batches.manage" },
        { title: "Students", href: "/institution/students", icon: Users, permission: "institution.students.manage" },
        { title: "Assessments", href: "/institution/assessments", icon: ClipboardCheck, permission: "institution.assessments.manage" },
        { title: "Certificates", href: "/institution/certificates", icon: Award, permission: "institution.certificates.issue" },
        { title: "Placements", href: "/institution/placements", icon: Target, permission: "institution.placements.manage" },
        { title: "Reports", href: "/institution/reports", icon: BarChart3, permission: "institution.reports.view" },
      ],
    },
    {
      title: "Institution",
      items: [
        { title: "Profile", href: "/institution/profile", icon: Building2, permission: "institution.profile.manage" },
        { title: "Team", href: "/institution/team", icon: Users, permission: "institution.team.manage" },
        { title: "Billing", href: "/institution/billing", icon: CreditCard, permission: "institution.billing.manage" },
        { title: "Support", href: "/institution/support", icon: LifeBuoy },
      ],
    },
  ],

  admin: [
    {
      items: [
        { title: "Executive dashboard", href: "/admin", icon: LayoutDashboard, permission: "dashboard.view", matchNested: false },
        { title: "Approval centre", href: "/admin/approvals", icon: ListChecks, permission: "approvals.view" },
      ],
    },
    {
      title: "Recruitment",
      items: [
        { title: "Requirements", href: "/admin/requirements", icon: HardHat, permission: "requirements.view" },
        { title: "Jobs", href: "/admin/jobs", icon: Briefcase, permission: "jobs.view" },
        { title: "Candidates", href: "/admin/candidates", icon: Users, permission: "candidates.view" },
        { title: "Pipeline", href: "/admin/pipeline", icon: KanbanSquare, permission: "recruitment.view" },
        { title: "Interviews", href: "/admin/interviews", icon: CalendarClock, permission: "recruitment.view" },
        { title: "Assessment centre", href: "/admin/assessments", icon: ClipboardCheck, permission: "recruitment.assessments" },
        { title: "Mobilisation", href: "/admin/mobilisation", icon: Plane, permission: "recruitment.mobilisation" },
      ],
    },
    {
      title: "Network",
      items: [
        { title: "Employers", href: "/admin/organizations?type=employer", icon: Building2, permission: "orgs.view", matchNested: false },
        { title: "Recruitment partners", href: "/admin/organizations?type=recruitment_partner", icon: Handshake, permission: "orgs.view", matchNested: false },
        { title: "Institutions", href: "/admin/organizations?type=institution", icon: GraduationCap, permission: "orgs.view", matchNested: false },
        { title: "Partner assignments", href: "/admin/partners", icon: Target, permission: "partners.view" },
        { title: "Training", href: "/admin/training", icon: BookOpen, permission: "training.view" },
        { title: "Users", href: "/admin/users", icon: UserCog, permission: "users.view" },
      ],
    },
    {
      title: "Engagement",
      items: [
        { title: "Leads & enquiries", href: "/admin/leads", icon: Mail, permission: "leads.view" },
        { title: "Support desk", href: "/admin/support", icon: Headset, permission: "support.view" },
        { title: "Privacy requests", href: "/admin/privacy", icon: Shield, permission: "privacy.requests" },
      ],
    },
    {
      title: "Website",
      items: [
        { title: "Content", href: "/admin/content", icon: Newspaper, permission: "content.view" },
        { title: "Media library", href: "/admin/media", icon: ImageIcon, permission: "media.manage" },
        { title: "Announcements", href: "/admin/announcements", icon: Megaphone, permission: "announcements.manage" },
        { title: "Public statistics", href: "/admin/public-metrics", icon: Activity, permission: "metrics.public_manage" },
        { title: "Analytics", href: "/admin/analytics", icon: MousePointerClick, permission: "analytics.view" },
      ],
    },
    {
      title: "Business",
      items: [
        { title: "Revenue & billing", href: "/admin/commercial", icon: Coins, permission: "commercial.view" },
        { title: "Invoices", href: "/admin/commercial/invoices", icon: Receipt, permission: "commercial.view" },
        { title: "Notifications", href: "/admin/notifications", icon: Bell, permission: "notifications.templates" },
      ],
    },
    {
      title: "Administration",
      items: [
        { title: "Settings", href: "/admin/settings", icon: Settings, permission: "settings.view" },
        { title: "Audit logs", href: "/admin/audit", icon: ScrollText, permission: "audit.view" },
        { title: "System", href: "/admin/system", icon: Gauge, permission: "system.jobs" },
      ],
    },
  ],
};

/** Public website header navigation (dropdown groups); labels/links can be overridden from the CMS. */
export const PUBLIC_NAV = [
  { title: "About Us", href: "/about" },
  {
    title: "What We Do",
    href: "/services",
    children: [
      { title: "Recruitment & placements", href: "/services/recruitment-and-placements" },
      { title: "Overseas employment", href: "/services/overseas-employment" },
      { title: "Bulk manpower supply", href: "/services/bulk-manpower-supply" },
      { title: "Training & skill development", href: "/services/professional-training" },
      { title: "Welding & industrial testing", href: "/services/welding-and-industrial-testing" },
      { title: "All services", href: "/services" },
    ],
  },
  {
    title: "Opportunities",
    href: "/jobs",
    children: [
      { title: "Jobs", href: "/jobs" },
      { title: "Overseas jobs", href: "/jobs?overseas=1" },
      { title: "Internships", href: "/jobs?type=internship" },
      { title: "Apprenticeships", href: "/jobs?type=apprenticeship" },
      { title: "Training programmes", href: "/training" },
      { title: "Events & hiring drives", href: "/events" },
    ],
  },
  { title: "Industries", href: "/industries" },
  { title: "Global Reach", href: "/global-reach" },
  { title: "Employers", href: "/employers" },
  { title: "Partners", href: "/partners" },
  { title: "Success Stories", href: "/success-stories" },
  { title: "Contact", href: "/contact" },
] as const;
