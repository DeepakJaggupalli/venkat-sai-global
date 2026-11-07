import type { Metadata } from "next";
import { Plus } from "lucide-react";

import { DataTable } from "@/components/shared/data-table";
import { DateText } from "@/components/shared/date-text";
import { EmptyState } from "@/components/shared/empty-state";
import { FilterBar, FilterPendingRegion, FilterScope, SearchInput } from "@/components/shared/filters";
import { LinkTabs } from "@/components/shared/link-tabs";
import { PageHeader } from "@/components/shared/page-header";
import { Pagination } from "@/components/shared/pagination";
import { StatusBadge } from "@/components/shared/status-badge";
import type { AnnouncementStatus } from "@/db/schema";
import { parsePage } from "@/lib/http";
import { requireStaff } from "@/modules/identity/authz";
import { ANNOUNCEMENT_PLACEMENT_LABELS, ANNOUNCEMENT_PRIORITY_LABELS, ANNOUNCEMENT_STATUS_LABELS, ANNOUNCEMENT_STATUS_VALUES } from "@/modules/content/constants";
import { CONTENT_ADMIN_PATHS } from "@/modules/content/links";
import { listAnnouncements } from "@/modules/content/queries";

export const metadata: Metadata = { title: "Announcements" };

type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

const STATUS_TONE = { draft: "neutral", scheduled: "brand", published: "success", expired: "warning", archived: "neutral" } as const;

export default async function AnnouncementsPage({ searchParams }: { searchParams: SP }) {
  const ctx = await requireStaff("announcements.manage");
  const sp = await searchParams;
  const statusRaw = one(sp.status);
  const status = (ANNOUNCEMENT_STATUS_VALUES as readonly string[]).includes(statusRaw ?? "") ? (statusRaw as AnnouncementStatus) : undefined;
  const fromPartners = one(sp.from) === "partners";
  const q = one(sp.q)?.slice(0, 100);
  const page = parsePage(sp, { defaultSize: 25 });
  const result = await listAnnouncements(ctx, { status, fromPartners, q }, page);
  const base = CONTENT_ADMIN_PATHS.announcements;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Announcements"
        description="Banners and notices for the public website and the portals. Each one runs within its schedule window and ends automatically."
        breadcrumbs={[{ label: "Command Centre", href: "/admin" }, { label: "Content", href: CONTENT_ADMIN_PATHS.content }, { label: "Announcements" }]}
        actions={[{ label: "New announcement", href: `${base}/new`, icon: <Plus aria-hidden /> }]}
      />
      <LinkTabs
        label="Announcement status"
        items={[
          { href: base, label: "All" },
          { href: `${base}?status=published`, label: "Live" },
          { href: `${base}?status=scheduled`, label: "Scheduled" },
          { href: `${base}?status=draft`, label: "Drafts" },
          { href: `${base}?status=expired`, label: "Ended" },
          { href: `${base}?status=archived`, label: "Archived" },
          { href: `${base}?from=partners`, label: "From partners" },
        ]}
      />
      <FilterScope>
        <FilterBar paramKeys={["q"]} search={<SearchInput label="Search announcements" />}>
          {null}
        </FilterBar>
        <FilterPendingRegion>
          <DataTable
            caption="Announcements"
            rows={result.items}
            getRowId={(r) => r.id}
            rowLink={(r) => ({ href: CONTENT_ADMIN_PATHS.announcement(r.id), label: `Open ${r.title}` })}
            columns={[
              {
                id: "title",
                header: "Announcement",
                primary: true,
                cell: (r) => (
                  <div className="min-w-0">
                    <p className="truncate font-medium">{r.title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {r.placements.map((p) => ANNOUNCEMENT_PLACEMENT_LABELS[p]).join(", ")}
                      {r.organizationName ? ` · from ${r.organizationName}` : ""}
                    </p>
                  </div>
                ),
              },
              { id: "status", header: "Status", cell: (r) => <StatusBadge tone={STATUS_TONE[r.status]} size="sm">{ANNOUNCEMENT_STATUS_LABELS[r.status]}</StatusBadge> },
              { id: "priority", header: "Priority", hideOnMobile: true, cell: (r) => <StatusBadge tone={r.priority === "critical" ? "danger" : r.priority === "high" ? "gold" : "neutral"} size="sm">{ANNOUNCEMENT_PRIORITY_LABELS[r.priority]}</StatusBadge> },
              {
                id: "window",
                header: "Runs",
                nowrap: true,
                cell: (r) =>
                  r.startsAt || r.endsAt ? (
                    <span className="text-sm">
                      {r.startsAt ? <DateText value={r.startsAt} mode="datetime" /> : "On publish"} – {r.endsAt ? <DateText value={r.endsAt} mode="datetime" /> : "until ended"}
                    </span>
                  ) : (
                    <span className="text-sm text-muted-foreground">Until ended</span>
                  ),
              },
            ]}
            empty={
              q || status || fromPartners ? (
                <EmptyState title="No announcements match" primaryAction={{ label: "Show all", href: base, variant: "outline" }} />
              ) : (
                <EmptyState title="No announcements yet" description="Create a banner for holidays, new programmes or important safety notices." primaryAction={{ label: "New announcement", href: `${base}/new` }} />
              )
            }
            footer={result.pageCount > 1 ? <Pagination pathname={base} searchParams={sp} page={result.page} pageCount={result.pageCount} total={result.total} pageSize={result.pageSize} itemLabel="announcements" /> : undefined}
          />
        </FilterPendingRegion>
      </FilterScope>
    </div>
  );
}
