// TEMPORARY visual QA page for the dashboard kit (foundation task). Delete before finishing.
import { Briefcase, FileUser, Inbox, ListChecks, Megaphone, MessageSquare, Plane, Users } from "lucide-react";
import { notFound } from "next/navigation";

import { DashboardHeader, EmptyState, GettingStarted, HowToUse, QuickActions, RecentList, SectionCard, StatGrid, StatTile } from "@/components/dashboard";
import { ChartCard } from "@/components/dashboard/chart-card";

export default function KitPreview() {
  if (process.env.NODE_ENV === "production") notFound();
  const now = new Date();
  const ago = (h: number) => new Date(now.getTime() - h * 3600_000);
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <DashboardHeader
        name="Ravi Kumar"
        subtitle="Owner · Venkat Sai Global"
        actions={[
          { label: "Post requirement", href: "/admin", icon: Megaphone },
          { label: "Applicants", href: "/admin", icon: FileUser },
          { label: "Approvals", href: "/admin", icon: ListChecks },
        ]}
      />
      <StatGrid label="Today">
        <StatTile label="CVs to call back" value={12} hint="3 new today" tone="attention" icon={FileUser} href="/admin" />
        <StatTile label="Waiting for approval" value={0} tone="attention" icon={ListChecks} href="/admin" />
        <StatTile label="Open requirements" value={48} icon={Briefcase} href="/admin" />
        <StatTile label="Revenue this month" value="AED 12,400" hint="Paid invoices only" icon={Plane} />
      </StatGrid>
      <HowToUse portal="admin" />
      <GettingStarted
        items={[
          { id: "a", label: "Add your company logo", done: true, href: "/admin" },
          { id: "b", label: "Invite your staff", description: "Give each person the right role.", done: false, href: "/admin" },
          { id: "c", label: "Post your first requirement", done: false, href: "/admin" },
        ]}
      />
      <QuickActions
        title="Quick actions"
        description="The jobs you do most."
        items={[
          { label: "Post requirement", href: "/admin", icon: Megaphone, hint: "From a poster photo" },
          { label: "Applicants and CVs", href: "/admin", icon: FileUser, hint: "Call back new people", badge: 7 },
          { label: "Approval centre", href: "/admin", icon: ListChecks, hint: "Verifications and jobs", badge: 2 },
          { label: "Messages", href: "/admin", icon: MessageSquare, hint: "Companies and partners" },
          { label: "Candidates", href: "/admin", icon: Users },
        ]}
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <RecentList
          title="Latest applicants"
          icon={FileUser}
          viewAll={{ label: "View all", href: "/admin" }}
          items={[
            { id: "1", title: "Suresh Babu", meta: "TIG welder · Dubai poster", at: ago(0.2), status: { value: "new", label: "New", tone: "info" } },
            { id: "2", title: "A very long name that should be truncated nicely", meta: "Pipe fitter · Saudi Arabia", at: ago(5), href: "/admin", status: { label: "Contacted", tone: "success" } },
            { id: "3", title: "Lakshmi P.", meta: "Electrician", at: ago(50), href: "/admin" },
          ]}
          empty={{ title: "No applicants yet" }}
        />
        <RecentList title="Recent interviews" items={[]} empty={{ title: "No interviews yet", description: "Interviews you schedule appear here.", action: { label: "Schedule an interview", href: "/admin" } }} />
        <ChartCard
          title="Applicants per week"
          description="Last 8 weeks"
          unit="applicants"
          link={{ label: "Open", href: "/admin" }}
          data={[
            { label: "6 Oct", value: 4 },
            { label: "13 Oct", value: 9 },
            { label: "20 Oct", value: 6 },
            { label: "27 Oct", value: 12 },
            { label: "3 Nov", value: 15 },
            { label: "10 Nov", value: 8 },
            { label: "17 Nov", value: 11 },
            { label: "24 Nov", value: 7 },
          ]}
        />
        <ChartCard title="Placements per month" type="line" data={[{ label: "Sep", value: 2 }, { label: "Oct", value: 5 }, { label: "Nov", value: 3 }]} />
        <ChartCard title="Empty chart" data={[]} />
        <SectionCard title="Section card" description="With a link action" action={{ label: "View all", href: "/admin" }}>
          <EmptyState icon={Inbox} title="Nothing here yet" description="Honest empty state with a next step." action={{ label: "Add one", href: "/admin" }} secondaryAction={{ label: "Learn more", href: "/admin" }} />
        </SectionCard>
      </div>
    </div>
  );
}
