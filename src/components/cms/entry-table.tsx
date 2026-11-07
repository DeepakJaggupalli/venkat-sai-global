"use client";

import { Archive, Star, UploadCloud } from "lucide-react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

import { SelectableDataTable, type BulkAction, type DataTableColumn, type DataTableSortState } from "@/components/shared/data-table";
import { RelativeTime } from "@/components/shared/relative-time";
import { StatusBadge } from "@/components/shared/status-badge";
import type { CmsCollection, CmsEntryStatus, ContentConsentStatus } from "@/db/schema";
import { archiveEntryAction, publishEntryAction } from "@/modules/content/actions";
import { CMS_ENTRY_STATUS_LABELS, CONTENT_CONSENT_STATUS_LABELS, CONTENT_LOCALE_LABELS } from "@/modules/content/constants";
import { CONTENT_ADMIN_PATHS } from "@/modules/content/links";

export type EntryRow = {
  id: string;
  collection: CmsCollection;
  title: string;
  slug: string;
  locale: string;
  status: CmsEntryStatus;
  hasUnpublishedChanges: boolean;
  isFeatured: boolean;
  publishAt: string | null;
  scheduledVersion: number | null;
  consentStatus: ContentConsentStatus;
  updatedAt: string;
  updatedByName: string | null;
  deleted: boolean;
};

const TONE = { draft: "neutral", scheduled: "brand", published: "success", archived: "warning" } as const;

async function runEach(ids: string[], fn: (id: string) => Promise<{ ok: boolean; error?: string }>, verb: string) {
  let done = 0;
  const failures: string[] = [];
  for (const id of ids) {
    const r = await fn(id);
    if (r.ok) done += 1;
    else if (r.error) failures.push(r.error);
  }
  if (failures.length === 0) return { ok: true as const, message: `${done} ${done === 1 ? "entry" : "entries"} ${verb}.` };
  return { ok: false as const, error: `${done} ${verb}; ${failures.length} could not be: ${failures[0]}` };
}

/** Collection list with bulk publish / archive (each entry is validated and authorised on its own). */
export function EntryTable({
  rows,
  sort,
  canPublish,
  consentRequired,
  approvalCollection,
  empty,
  footer,
}: {
  rows: EntryRow[];
  sort?: DataTableSortState;
  canPublish: boolean;
  consentRequired: boolean;
  approvalCollection: boolean;
  empty: ReactNode;
  footer?: ReactNode;
}) {
  const router = useRouter();
  const bulkActions: BulkAction[] = canPublish
    ? [
        {
          id: "publish",
          label: approvalCollection ? "Submit for approval" : "Publish",
          icon: <UploadCloud aria-hidden />,
          confirm: {
            title: approvalCollection ? "Submit the selected entries for approval?" : "Publish the selected entries?",
            description: "The latest saved version of each entry goes live. Entries that are incomplete are skipped with a message.",
            confirmLabel: approvalCollection ? "Submit" : "Publish",
          },
          onAction: async (ids) => {
            const r = await runEach(ids, (id) => publishEntryAction({ id }), approvalCollection ? "submitted" : "published");
            router.refresh();
            return r;
          },
        },
        {
          id: "archive",
          label: "Archive",
          icon: <Archive aria-hidden />,
          variant: "outline",
          confirm: { title: "Archive the selected entries?", description: "They are removed from the website. You can restore them from the archive.", confirmLabel: "Archive" },
          onAction: async (ids) => {
            const r = await runEach(ids, (id) => archiveEntryAction({ id }), "archived");
            router.refresh();
            return r;
          },
        },
      ]
    : [];

  const columns: DataTableColumn<EntryRow>[] = [
    {
      id: "title",
      header: "Title",
      primary: true,
      sortKey: sort ? "title" : undefined,
      cell: (r) => (
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 font-medium">
            <span className="truncate">{r.title}</span>
            {r.isFeatured && <Star className="size-3.5 shrink-0 fill-gold text-gold-strong" aria-label="Featured" />}
          </p>
          <p className="truncate text-xs text-muted-foreground">/{r.slug}</p>
        </div>
      ),
    },
    {
      id: "status",
      header: "Status",
      cell: (r) => (
        <div className="flex flex-wrap gap-1">
          {r.deleted ? <StatusBadge tone="danger" size="sm">In the bin</StatusBadge> : <StatusBadge tone={TONE[r.status]} size="sm">{CMS_ENTRY_STATUS_LABELS[r.status]}</StatusBadge>}
          {r.hasUnpublishedChanges && !r.deleted && <StatusBadge tone="warning" size="sm">Unpublished changes</StatusBadge>}
          {r.scheduledVersion && r.publishAt && r.status === "published" && <StatusBadge tone="brand" size="sm">Update scheduled</StatusBadge>}
        </div>
      ),
    },
    ...(consentRequired
      ? [
          {
            id: "consent",
            header: "Consent",
            hideOnMobile: false,
            cell: (r: EntryRow) => <StatusBadge tone={r.consentStatus === "obtained" ? "success" : r.consentStatus === "withdrawn" ? "danger" : "warning"} size="sm">{CONTENT_CONSENT_STATUS_LABELS[r.consentStatus]}</StatusBadge>,
          } satisfies DataTableColumn<EntryRow>,
        ]
      : []),
    { id: "locale", header: "Language", hideOnMobile: true, cell: (r) => CONTENT_LOCALE_LABELS[r.locale as keyof typeof CONTENT_LOCALE_LABELS] ?? r.locale },
    {
      id: "updatedAt",
      header: "Updated",
      sortKey: sort ? "updated" : undefined,
      nowrap: true,
      cell: (r) => (
        <span className="text-sm">
          <RelativeTime value={r.updatedAt} />
          {r.updatedByName && <span className="block text-xs text-muted-foreground">{r.updatedByName}</span>}
        </span>
      ),
    },
  ];

  return (
    <SelectableDataTable
      caption="Entries"
      rows={rows}
      getRowId={(r) => r.id}
      rowLink={(r) => ({ href: CONTENT_ADMIN_PATHS.entry(r.collection, r.id), label: `Edit ${r.title}` })}
      columns={columns}
      sort={sort}
      bulkActions={bulkActions}
      selectLabel={(r) => `Select ${r.title}`}
      isRowSelectable={(r) => canPublish && !r.deleted}
      empty={empty}
      footer={footer}
    />
  );
}
