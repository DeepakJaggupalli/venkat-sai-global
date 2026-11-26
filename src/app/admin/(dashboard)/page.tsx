import {
  Activity,
  Briefcase,
  Building2,
  CalendarCheck2,
  ClipboardCheck,
  FileUser,
  FileWarning,
  Gift,
  Handshake,
  HardHat,
  Headset,
  IdCard,
  ListChecks,
  Mail,
  Megaphone,
  MousePointerClick,
  PhoneCall,
  Plane,
  Receipt,
  Star,
  Tags,
  Target,
  type LucideIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import {
  COMMAND_CENTRE_ACTIONS,
  filterAllowed,
  headerActions,
  moneyLine,
  plural,
  roleLabel,
  seatState,
  tileColumns,
  timeLabel,
  type ActionBadgeKey,
} from "@/components/admin/command-centre/config";
import { getCommandCentreSnapshot, shortDate, TOP_TRADES, TRADE_WINDOW_DAYS, type CommandCentreSnapshot } from "@/components/admin/command-centre/queries";
import { RankedBars } from "@/components/admin/command-centre/ranked-bars";
import {
  DashboardHeader,
  EmptyState,
  GettingStarted,
  HowToUse,
  QuickActions,
  RecentList,
  SectionCard,
  StatGrid,
  StatTile,
  type StatTileTone,
} from "@/components/dashboard";
import { ChartCard } from "@/components/dashboard/chart-card";
import { Callout } from "@/components/shared/callout";
import { DEFAULT_ROLES } from "@/config/permissions";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { getAnalyticsRange } from "@/modules/analytics/access";
import { getAnalyticsOverview } from "@/modules/analytics/queries";
import type { AnalyticsOverview } from "@/modules/analytics/types";
import { requireStaff, staffCan, type StaffContext } from "@/modules/identity/authz";

export const metadata: Metadata = { title: "Executive dashboard" };

const ROLE_NAMES: ReadonlyMap<string, string> = new Map(DEFAULT_ROLES.filter((r) => r.scope === "platform").map((r) => [r.key, r.name]));

type Tile = {
  key: string;
  label: string;
  value: number | string | null;
  href: string;
  icon: LucideIcon;
  hint?: string;
  tone?: StatTileTone;
  attentionLabel?: string;
};

/**
 * Command Centre home (spec 12.1): the whole business at a glance for the owner and every staff member. Role-aware:
 * each figure, list and button shows only when the viewer can open the page behind it (permissions, never role
 * names). Every number is a live database count; money is shown per currency and never added across currencies.
 */
export default async function CommandCentreHomePage() {
  const staff = await requireStaff();
  const now = new Date();
  const [s, traffic] = await Promise.all([
    getCommandCentreSnapshot(staff, now),
    // Website visits (consent-based first-party analytics); the dashboard still works if analytics is down.
    staffCan(staff, "analytics.view") ? getAnalyticsOverview(staff, getAnalyticsRange({ range: "30d" }, now)).catch(() => null) : Promise.resolve(null),
  ]);

  const actions = filterAllowed(COMMAND_CENTRE_ACTIONS, staff.permissions);
  const badges = badgeCounts(s);
  const attention = attentionTiles(s);
  const glance = glanceTiles(s, traffic);
  const waiting = attention.filter((t) => t.tone === "attention" && typeof t.value === "number" && t.value > 0).length;
  const role = roleLabel(staff.roleKeys, ROLE_NAMES);

  return (
    <div className="space-y-8">
      <DashboardHeader
        name={staff.user.displayName}
        subtitle={`${role ? `${role} · ` : ""}Venkat Sai Global Command Centre`}
        now={now}
        actions={headerActions(actions).map((a) => ({
          label: a.label,
          href: a.href,
          icon: a.icon,
        }))}
      >
        <span
          className={cn(
            "inline-flex min-h-8 items-center gap-2 rounded-full px-3 text-[13px] font-semibold",
            waiting > 0 ? "bg-warning-soft text-warning-strong" : "bg-success-soft text-success-strong",
          )}
        >
          <span aria-hidden="true" className={cn("size-1.5 rounded-full", waiting > 0 ? "bg-warning" : "bg-success")} />
          {waiting > 0 ? `${plural(waiting, "area")} ${waiting === 1 ? "needs" : "need"} action` : "Nothing waiting right now"}
        </span>
        <span className="border-border text-muted-foreground inline-flex min-h-8 items-center gap-1.5 rounded-full border bg-white px-3 text-[13px]">
          <Activity aria-hidden="true" className="text-accent-fill size-3.5" />
          Live figures · tap a number to open the list
        </span>
      </DashboardHeader>

      {s.partial ? (
        <Callout tone="warning" title="Some figures did not load">
          The rest of the dashboard is up to date.{" "}
          <Link href="/admin" className="font-semibold underline underline-offset-2">
            Refresh
          </Link>{" "}
          to try again.
        </Callout>
      ) : null}

      <HowToUse portal="admin" permissions={staff.permissions} />

      {s.setup ? <SetupChecklist staff={staff} setup={s.setup} /> : null}

      <section aria-labelledby="dash-attention" className="space-y-3">
        <SectionHeading id="dash-attention" title="Needs your attention" description="Work waiting for the team. Each number opens the list behind it." />
        <TileGrid tiles={attention} />
      </section>

      <QuickActions
        title="Quick actions"
        description="Every main job in the Command Centre, one tap away."
        // Three across when that leaves no lone card on the last row (9 buttons), otherwise four.
        columns={actions.length % 4 === 1 && actions.length % 3 === 0 ? 3 : 4}
        items={actions.map((a) => ({
          label: a.label,
          href: a.href,
          icon: a.icon,
          hint: a.hint,
          badge: a.badge ? badges[a.badge] : null,
          badgeLabel: a.badgeLabel,
        }))}
      />

      {glance.length ? (
        <section aria-labelledby="dash-glance" className="space-y-3">
          <SectionHeading id="dash-glance" title="Business at a glance" description="Where things stand right now. Tap a number to open the list behind it." />
          <TileGrid tiles={glance} />
        </section>
      ) : null}

      {s.cvs ? <CvCharts cvs={s.cvs} /> : null}

      <Lists s={s} canPost={staffCan(staff, ["content.edit", "media.manage"])} now={now} />
    </div>
  );
}

function SectionHeading({ id, title, description }: { id: string; title: string; description?: string }) {
  return (
    <div className="space-y-1">
      <h2 id={id} className="font-heading text-foreground text-lg font-bold">
        {title}
      </h2>
      {description ? <p className="text-muted-foreground text-sm text-pretty">{description}</p> : null}
    </div>
  );
}

function TileGrid({ tiles }: { tiles: Tile[] }) {
  const columns = tileColumns(tiles.length);
  return (
    <StatGrid columns={columns === 5 ? 4 : columns} className={cn(columns === 5 && "xl:grid-cols-5")}>
      {tiles.map(({ key, ...tile }) => (
        <StatTile key={key} {...tile} />
      ))}
    </StatGrid>
  );
}

function badgeCounts(s: CommandCentreSnapshot): Record<ActionBadgeKey, number | null> {
  return {
    cvsToCall: s.cvs?.toCallBack ?? null,
    requirementsToReview: s.requirements?.toReview ?? null,
    approvals: s.approvalsOpen,
    reviewsPending: s.candidateCare?.reviewsPending ?? null,
    referralsDue: s.candidateCare?.referralsDue ?? null,
    newEnquiries: s.leads?.newEnquiries ?? null,
    supportOpen: s.support?.open ?? null,
  };
}

function attentionTiles(s: CommandCentreSnapshot): Tile[] {
  const tiles: (Tile | null)[] = [
    s.cvs
      ? {
          key: "call",
          label: "New CVs to call back",
          value: s.cvs.toCallBack,
          href: "/admin/cv-submissions?status=received",
          icon: PhoneCall,
          tone: "attention",
          hint: s.cvs.today ? `${s.cvs.today} came in today` : "Status still “CV received”",
        }
      : null,
    s.approvalsOpen !== null
      ? {
          key: "approvals",
          label: "Pending approvals",
          value: s.approvalsOpen,
          href: "/admin/approvals",
          icon: ListChecks,
          tone: "attention",
          hint: "Verifications, jobs and requirements",
        }
      : null,
    s.requirements
      ? {
          key: "requirements",
          label: "Manpower requests to review",
          value: s.requirements.toReview,
          href: "/admin/requirements?status=submitted",
          icon: HardHat,
          tone: "attention",
          hint: "Sent by companies and agencies",
        }
      : null,
    s.leads
      ? {
          key: "enquiries",
          label: "New enquiries",
          value: s.leads.newEnquiries,
          href: "/admin/leads?tab=enquiries&status=new",
          icon: Mail,
          tone: "attention",
          hint: "Not answered yet",
        }
      : null,
    s.candidateCare
      ? {
          key: "reviews",
          label: "Reviews to approve",
          value: s.candidateCare.reviewsPending,
          href: "/admin/reviews?tab=pending",
          icon: Star,
          tone: "attention",
          hint: "Before they show on the website",
        }
      : null,
    s.candidateCare
      ? {
          key: "referrals",
          label: "Referral rewards due",
          value: s.candidateCare.referralsDue,
          href: "/admin/referrals?reward=due",
          icon: Gift,
          tone: "attention",
          hint: "Friends who flew out",
        }
      : null,
    s.cvs
      ? {
          key: "passports",
          label: "Passports expiring soon",
          value: s.cvs.expiringPassports,
          href: "/admin/cv-submissions?expiring=1",
          icon: IdCard,
          tone: "attention",
          hint: "Within 6 months, or already expired",
        }
      : null,
    s.support
      ? {
          key: "support",
          label: "Open support requests",
          value: s.support.open,
          href: "/admin/support",
          icon: Headset,
          tone: "attention",
          hint: s.support.grievances ? `${plural(s.support.grievances, "grievance")} among them` : "Complaints and questions",
        }
      : null,
    s.jobs
      ? {
          key: "jobs",
          label: "Jobs awaiting approval",
          value: s.jobs.pendingApproval,
          href: "/admin/jobs?statuses=pending_approval",
          icon: FileWarning,
          tone: "attention",
          hint: "Posted by companies",
        }
      : null,
    {
      key: "tasks",
      label: "My open tasks",
      value: s.tasks?.open ?? null,
      href: "/admin/tasks",
      icon: ClipboardCheck,
      tone: (s.tasks?.overdue ?? 0) > 0 ? "attention" : "default",
      attentionLabel: "Overdue",
      hint: !s.tasks ? "Could not load" : s.tasks.overdue > 0 ? `${s.tasks.overdue} overdue` : "None overdue",
    },
  ];
  return tiles.filter((t): t is Tile => t !== null);
}

function glanceTiles(s: CommandCentreSnapshot, traffic: AnalyticsOverview | null): Tile[] {
  const money = (amountMinor: number, currency: string) => formatMoney(amountMinor, currency);
  const tiles: (Tile | null)[] = [
    s.cvs
      ? {
          key: "cvs-today",
          label: "New CVs today",
          value: s.cvs.today,
          href: "/admin/cv-submissions",
          icon: FileUser,
          hint: `${s.cvs.week} in the last 7 days`,
        }
      : null,
    s.posters
      ? {
          key: "posters",
          label: "Live requirement posters",
          value: s.posters.open,
          href: "/admin/requirements/posters?status=published",
          icon: Megaphone,
          hint: "On the website now",
        }
      : null,
    s.requirements
      ? {
          key: "manpower",
          label: "Open manpower requests",
          value: s.requirements.open,
          href: "/admin/requirements",
          icon: HardHat,
          hint: `${plural(s.requirements.positionsOpen, "position")} still to fill`,
        }
      : null,
    s.bookings
      ? {
          key: "dates",
          label: "Upcoming test and training dates",
          value: s.bookings.upcoming,
          href: "/admin/bookings",
          icon: CalendarCheck2,
          hint: `${plural(s.bookings.bookedSeats, "seat")} booked · ${s.bookings.freeSeats} free`,
        }
      : null,
    s.leads
      ? {
          key: "leads",
          label: "Open leads",
          value: s.leads.open,
          href: "/admin/leads",
          icon: Target,
          hint: "Possible new business",
        }
      : null,
    s.money
      ? {
          key: "unpaid",
          label: "Unpaid invoices",
          value: s.money.unpaidCount,
          href: "/admin/commercial/invoices",
          icon: Receipt,
          tone: "attention",
          attentionLabel: "To collect",
          hint: moneyLine(s.money.unpaid, money) ?? "Nothing outstanding",
        }
      : null,
    s.jobs
      ? {
          key: "jobs-live",
          label: "Live jobs",
          value: s.jobs.active,
          href: "/admin/jobs?statuses=published",
          icon: Briefcase,
          hint: "Open for applications",
        }
      : null,
    s.placements30d !== null
      ? {
          key: "placements",
          label: "Placements, last 30 days",
          value: s.placements30d,
          href: "/admin/mobilisation",
          icon: Plane,
          tone: "positive",
          hint: "Workers placed with employers",
        }
      : null,
    s.orgs
      ? {
          key: "companies",
          label: "Companies and travel agencies",
          value: s.orgs.companies + s.orgs.agencies,
          href: "/admin/organizations?type=employer",
          icon: Building2,
          hint: `${plural(s.orgs.companies, "company", "companies")} · ${plural(s.orgs.agencies, "agency", "agencies")}`,
        }
      : null,
    s.orgs
      ? {
          key: "partners",
          label: "Partners and institutions",
          value: s.orgs.partners + s.orgs.institutions,
          href: "/admin/organizations?type=recruitment_partner",
          icon: Handshake,
          hint: `${plural(s.orgs.partners, "recruitment partner")} · ${plural(s.orgs.institutions, "institution")}`,
        }
      : null,
    traffic
      ? {
          key: "visits",
          label: "Website visits, last 30 days",
          value: traffic.current.sessions,
          href: "/admin/analytics",
          icon: MousePointerClick,
          hint: `${plural(traffic.current.visitors, "visitor")} · ${plural(traffic.current.conversions, "key action")}`,
        }
      : null,
  ];
  return tiles.filter((t): t is Tile => t !== null);
}

function CvCharts({ cvs }: { cvs: NonNullable<CommandCentreSnapshot["cvs"]> }) {
  const total14 = cvs.perDay.reduce((a, d) => a + d.value, 0);
  const shownTrades = cvs.byTrade.reduce((a, t) => a + t.count, 0);
  const otherTrades = Math.max(0, cvs.tradeWindowTotal - shownTrades);
  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <ChartCard
        className="lg:col-span-3"
        title="New CVs per day"
        description={`Last 14 days, India time · ${plural(total14, "CV")} in total`}
        data={cvs.perDay.map((d) => ({ label: d.label, value: d.value }))}
        unit="CVs"
        link={{ label: "All CVs", href: "/admin/cv-submissions" }}
        emptyTitle="No CVs in the last 14 days"
        emptyDescription="New CVs from the website, Excel imports and phone calls show here day by day."
      />
      <SectionCard
        className="lg:col-span-2"
        title="CVs by trade"
        description={`Top ${TOP_TRADES} trades, last ${TRADE_WINDOW_DAYS} days${otherTrades ? ` · ${plural(otherTrades, "more CV")} in other trades` : ""}`}
        action={cvs.byTrade.length ? { label: "All CVs", href: "/admin/cv-submissions" } : undefined}
      >
        {cvs.byTrade.length ? (
          <RankedBars
            unit={{ one: "CV", many: "CVs" }}
            items={cvs.byTrade.map((t) => ({
              key: t.trade.toLowerCase(),
              label: t.trade,
              value: t.count,
              href: t.categoryId ? `/admin/cv-submissions?trade=${t.categoryId}` : `/admin/cv-submissions?q=${encodeURIComponent(t.trade)}`,
            }))}
          />
        ) : (
          <EmptyState
            size="sm"
            icon={Tags}
            title={`No CVs in the last ${TRADE_WINDOW_DAYS} days`}
            description="The trades people apply for show here, most popular first."
          />
        )}
      </SectionCard>
    </div>
  );
}

const ACTIVITY_STATUS = {
  cv: { label: "New CV", tone: "info" },
  booking: { label: "Booking", tone: "brand" },
  enquiry: { label: "Enquiry", tone: "gold" },
} as const;

function Lists({ s, canPost, now }: { s: CommandCentreSnapshot; canPost: boolean; now: Date }) {
  const side = [
    s.posters ? (
      <RecentList
        key="posters"
        title="Live requirement posters"
        description="Newest first, with the people who applied."
        icon={Megaphone}
        now={now}
        viewAll={{ label: "All posters", href: "/admin/requirements/posters" }}
        items={s.posters.items.map((p) => ({
          id: p.id,
          title: p.title,
          meta: [p.country, plural(p.applicants, "applicant")].filter(Boolean).join(" · "),
          at: p.publishedAt,
          href: s.access.posterApplicants ? `/admin/requirements/posters/${p.id}/applicants` : "/admin/requirements/posters",
          status:
            p.applicantsWeek > 0
              ? {
                  label: `${p.applicantsWeek} new this week`,
                  tone: "info" as const,
                }
              : null,
        }))}
        empty={{
          title: "No live posters",
          description: "Post a requirement and it goes live on the website for people to apply.",
          icon: Megaphone,
          action: canPost
            ? {
                label: "Post a requirement",
                href: "/admin/requirements/posters/new",
              }
            : undefined,
        }}
      />
    ) : null,
    s.bookings ? (
      <RecentList
        key="dates"
        title="Next test and training dates"
        description="Seats booked on the coming dates."
        icon={CalendarCheck2}
        now={now}
        viewAll={{ label: "All dates", href: "/admin/bookings" }}
        items={s.bookings.next.map((slot) => {
          const seats = seatState(slot);
          return {
            id: slot.id,
            title: slot.title,
            meta: `${shortDate(slot.date)} · ${timeLabel(slot.startTime)} · ${slot.bookedSeats} of ${slot.capacity} seats booked`,
            href: `/admin/bookings/${slot.id}`,
            status: { label: seats.label, tone: seats.tone },
          };
        })}
        empty={{
          title: "No upcoming dates",
          description: "Open a trade test or training date so workers and agencies can book seats online.",
          icon: CalendarCheck2,
          action: { label: "Open a new date", href: "/admin/bookings/new" },
        }}
      />
    ) : null,
  ].filter(Boolean);
  const activity =
    s.access.cvs || s.access.bookings || s.access.leads ? (
      <RecentList
        key="activity"
        title="Latest activity"
        description="New CVs, bookings and enquiries as they come in."
        icon={Activity}
        now={now}
        limit={8}
        items={s.activity.map((a) => ({
          id: a.id,
          title: a.title,
          meta: a.meta,
          at: a.at,
          href: a.href,
          status: ACTIVITY_STATUS[a.kind],
        }))}
        empty={{
          title: "Nothing new yet",
          description: "New CVs, bookings and enquiries will show here the moment they arrive.",
        }}
      />
    ) : null;
  if (!activity && side.length === 0) return null;
  if (!activity) return <div className={cn("grid items-start gap-4", side.length === 2 && "lg:grid-cols-2")}>{side}</div>;
  if (side.length === 0) return activity;
  // Activity gets the wide column (long names and details); posters and dates stack beside it.
  return (
    <div className="grid items-start gap-4 lg:grid-cols-5">
      <div className="min-w-0 lg:col-span-3">{activity}</div>
      <div className="grid min-w-0 gap-4 lg:col-span-2">{side}</div>
    </div>
  );
}

function SetupChecklist({ staff, setup }: { staff: StaffContext; setup: NonNullable<CommandCentreSnapshot["setup"]> }) {
  const items = [
    staffCan(staff, ["content.edit", "media.manage"])
      ? {
          id: "poster",
          label: "Post your first requirement",
          description: "A photo of the poster, the country and the trades. It goes live on the website.",
          done: setup.posters > 0,
          href: "/admin/requirements/posters/new",
        }
      : null,
    staffCan(staff, "candidates.manage")
      ? {
          id: "cvs",
          label: "Bring in your CVs",
          description: "Import the Excel sheet you already keep, or share the Send your CV link.",
          done: setup.cvs > 0,
          href: "/admin/cv-submissions/import",
        }
      : null,
    staffCan(staff, "recruitment.assessments")
      ? {
          id: "dates",
          label: "Open a trade test or training date",
          description: "Workers and agencies then book seats online.",
          done: setup.slots > 0,
          href: "/admin/bookings/new",
        }
      : null,
    staffCan(staff, "users.roles")
      ? {
          id: "staff",
          label: "Add your staff",
          description: "Give each person a role so they see only their own work.",
          done: setup.otherStaff > 0,
          href: "/admin/users?kind=staff",
        }
      : null,
  ].filter((i) => i !== null);
  return <GettingStarted items={items} title="Set up your Command Centre" description="A few one-time steps. This card hides itself when they are done." />;
}
