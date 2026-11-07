import type { Metadata } from "next";
import { FolderKanban } from "lucide-react";

import { labelFor, TALENT_LIST_KIND_LABELS } from "@/components/employer-talent/labels";
import { ListFormDialog } from "@/components/employer-talent/list-form-dialog";
import { DataTable } from "@/components/shared/data-table";
import { DateText } from "@/components/shared/date-text";
import { EmptyState } from "@/components/shared/empty-state";
import { LinkTabs } from "@/components/shared/link-tabs";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import type { SearchParams } from "@/lib/http";
import { orgCan, requireOrgMember } from "@/modules/identity/authz";
import { asEmployer } from "@/modules/recruitment/actors";
import { listTalentLists } from "@/modules/recruitment/queries";
import type { TalentListSummary } from "@/modules/recruitment/types";

import { orgJobOptions } from "./_lib/queries";

export const metadata: Metadata = { title: "Talent lists" };

export default async function TalentListsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requireOrgMember("employer", "employer.candidates.lists");
  const sp = await searchParams;
  const showArchived = sp.archived === "1";
  const [all, jobs] = await Promise.all([listTalentLists(asEmployer(ctx), { includeArchived: true }), orgJobOptions(ctx)]);
  const rows = all.filter((l) => (showArchived ? l.archivedAt !== null : l.archivedAt === null));
  const archivedCount = all.filter((l) => l.archivedAt !== null).length;
  const canSearch = orgCan(ctx, "employer.candidates.search");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Talent lists"
        description="Shortlists, saved candidates and hiring projects. Notes on lists stay inside your organisation."
        actions={<ListFormDialog jobs={jobs} />}
      />
      <LinkTabs
        label="List status"
        items={[
          { href: "/employer/lists", label: "Active", count: all.length - archivedCount, match: "exact" },
          { href: "/employer/lists?archived=1", label: "Archived", count: archivedCount },
        ]}
      />
      <DataTable<TalentListSummary>
        caption={showArchived ? "Archived talent lists" : "Active talent lists"}
        rows={rows}
        getRowId={(l) => l.id}
        rowLink={(l) => ({ href: `/employer/lists/${l.id}`, label: `Open ${l.name}` })}
        columns={[
          {
            id: "name",
            header: "List",
            primary: true,
            cell: (l) => (
              <div className="min-w-0">
                <p className="font-medium">{l.name}</p>
                {l.description ? <p className="line-clamp-1 text-xs text-muted-foreground">{l.description}</p> : null}
              </div>
            ),
          },
          { id: "kind", header: "Type", cell: (l) => labelFor(TALENT_LIST_KIND_LABELS, l.kind) },
          { id: "items", header: "Candidates", align: "right", cell: (l) => l.itemCount },
          {
            id: "sharing",
            header: "Sharing",
            cell: (l) => (
              <StatusBadge tone={l.isShared ? "info" : "neutral"} size="sm">
                {l.isShared ? "Team" : "Private"}
              </StatusBadge>
            ),
          },
          { id: "owner", header: "Created by", hideOnMobile: true, cell: (l) => (l.isOwn ? "You" : (l.createdByName ?? "—")) },
          { id: "updated", header: "Updated", hideOnMobile: true, cell: (l) => <DateText value={l.updatedAt} /> },
        ]}
        empty={
          showArchived ? (
            <EmptyState title="No archived lists" description="Lists you archive appear here and can be restored." />
          ) : (
            <EmptyState
              icon={<FolderKanban aria-hidden />}
              title="No talent lists yet"
              description="Create a list for a role or project, then add candidates from search or from your pipeline."
              primaryAction={canSearch ? { label: "Find candidates", href: "/employer/candidates" } : undefined}
            />
          )
        }
      />
    </div>
  );
}
