import type { Metadata } from "next";
import Link from "next/link";
import { FileText, LayoutGrid, List, PlayCircle, ShieldAlert, Video } from "lucide-react";

import { MediaAddButton } from "@/components/cms/media-add-button";
import { MediaFolders } from "@/components/cms/media-folders";
import { DataTable } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { FilterBar, FilterChips, FilterPendingRegion, FilterScope, FilterSelect, SearchInput } from "@/components/shared/filters";
import { PageHeader } from "@/components/shared/page-header";
import { Pagination } from "@/components/shared/pagination";
import { RelativeTime } from "@/components/shared/relative-time";
import { StatusBadge } from "@/components/shared/status-badge";
import { parsePage, withParams } from "@/lib/http";
import { cn } from "@/lib/utils";
import { requireStaff } from "@/modules/identity/authz";
import {
  CONTENT_CONSENT_STATUS_LABELS,
  CONTENT_CONSENT_STATUS_VALUES,
  MEDIA_KIND_LABELS,
  MEDIA_KIND_VALUES,
  MEDIA_STATUS_LABELS,
  MEDIA_STATUS_VALUES,
} from "@/modules/content/constants";
import { CONTENT_ADMIN_PATHS } from "@/modules/content/links";
import { listMediaAssets, listMediaFolders, listMediaTags } from "@/modules/content/queries";
import { mediaListFiltersSchema } from "@/modules/content/schemas";
import type { MediaListItem } from "@/modules/content/types";

export const metadata: Metadata = { title: "Media library" };

type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

const kindOptions = MEDIA_KIND_VALUES.map((k) => ({ value: k, label: MEDIA_KIND_LABELS[k] }));
const statusOptions = MEDIA_STATUS_VALUES.map((s) => ({ value: s, label: MEDIA_STATUS_LABELS[s] }));
const visibilityOptions = [
  { value: "public", label: "Public" },
  { value: "internal", label: "Internal" },
];
const consentOptions = CONTENT_CONSENT_STATUS_VALUES.map((s) => ({ value: s, label: CONTENT_CONSENT_STATUS_LABELS[s] }));

function Thumb({ item }: { item: MediaListItem }) {
  if (item.kind === "image" && (item.thumbnailUrl || item.url)) {
    // eslint-disable-next-line @next/next/no-img-element -- files-module thumbnails (already sized WebP variants)
    return <img src={item.thumbnailUrl ?? item.url ?? ""} alt="" loading="lazy" className="aspect-video w-full rounded-md bg-surface-subtle object-cover" />;
  }
  const Icon = item.kind === "embed" ? PlayCircle : item.kind === "video" ? Video : FileText;
  return (
    <div className="flex aspect-video w-full items-center justify-center rounded-md bg-surface-subtle text-muted-foreground">
      <Icon className="size-8" aria-hidden />
    </div>
  );
}

function Flags({ item }: { item: MediaListItem }) {
  return (
    <span className="flex flex-wrap gap-1">
      <StatusBadge tone={item.visibility === "public" ? "success" : "neutral"} size="sm">
        {item.visibility === "public" ? "Public" : "Internal"}
      </StatusBadge>
      {item.status === "archived" && <StatusBadge tone="warning" size="sm">Archived</StatusBadge>}
      {item.showsIdentifiablePeople && item.consentStatus !== "obtained" && (
        <StatusBadge tone="warning" size="sm" icon={<ShieldAlert className="size-3" aria-hidden />}>
          Consent needed
        </StatusBadge>
      )}
      {item.showsIdentifiablePeople === null && <StatusBadge tone="neutral" size="sm">People not assessed</StatusBadge>}
      {item.kind === "image" && item.altText === null && <StatusBadge tone="warning" size="sm">No alt text</StatusBadge>}
    </span>
  );
}

export default async function MediaLibraryPage({ searchParams }: { searchParams: SP }) {
  const ctx = await requireStaff("media.manage");
  const sp = await searchParams;
  const view = one(sp.view) === "list" ? "list" : "grid";
  const parsed = mediaListFiltersSchema.safeParse({
    q: one(sp.q),
    kind: one(sp.kind),
    folderId: one(sp.folder),
    tag: one(sp.tag),
    status: one(sp.status),
    visibility: one(sp.visibility),
    consentStatus: one(sp.consentStatus),
  });
  const filters = parsed.success ? parsed.data : {};
  const page = parsePage(sp, { defaultSize: 24 });
  const [result, folders, tags] = await Promise.all([listMediaAssets(ctx, filters, page), listMediaFolders(ctx), listMediaTags(ctx)]);
  const base = CONTENT_ADMIN_PATHS.media;
  const activeFolder = filters.folderId ?? null;
  const folderHref = (folder: string | null) => withParams(base, sp, { folder, page: null });
  const hrefFor: Record<string, string> = { all: folderHref(null), unfiled: folderHref("unfiled") };
  for (const f of folders) hrefFor[f.id] = folderHref(f.id);
  const tagOptions = tags.map((t) => ({ value: t, label: t }));
  const filtered = Boolean(filters.q || filters.kind || filters.tag || filters.status || filters.visibility || filters.consentStatus);
  const activeFolderName = activeFolder === "unfiled" ? "Unfiled" : folders.find((f) => f.id === activeFolder)?.name;

  const empty = filtered ? (
    <EmptyState title="No media matches" description="Try other filters or clear them." primaryAction={{ label: "Clear filters", href: folderHref(activeFolder), variant: "outline" }} />
  ) : (
    <EmptyState
      title={activeFolderName ? `“${activeFolderName}” is empty` : "The media library is empty"}
      description="Upload photos of your workshop, training and events, documents and brochures, or add YouTube and Vimeo videos. Only use photos of people who agreed to it."
      primaryAction={<MediaAddButton folderId={activeFolder && activeFolder !== "unfiled" ? activeFolder : null} />}
    />
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Media library"
        description="Images, documents and videos used across the website. Alt text is required before an image can be public, and photos of people need recorded consent."
        breadcrumbs={[{ label: "Command Centre", href: "/admin" }, { label: "Content", href: CONTENT_ADMIN_PATHS.content }, { label: "Media library" }]}
        actions={[<MediaAddButton key="add" folderId={activeFolder && activeFolder !== "unfiled" ? activeFolder : null} />]}
      />

      <div className="grid gap-6 lg:grid-cols-[14rem_minmax(0,1fr)]">
        <aside className="rounded-xl border bg-card p-3 lg:self-start">
          <MediaFolders folders={folders.map((f) => ({ id: f.id, name: f.name, parentId: f.parentId, assetCount: f.assetCount, childCount: f.childCount }))} active={activeFolder} hrefFor={hrefFor} canManage />
        </aside>

        <div className="min-w-0 space-y-4">
          <FilterScope>
            <FilterBar
              paramKeys={["q", "kind", "tag", "status", "visibility", "consentStatus"]}
              search={<SearchInput label="Search media" placeholder="Title, alt text, caption or credit" />}
              actions={
                <div className="flex rounded-md border p-0.5" role="group" aria-label="Layout">
                  <Link
                    href={withParams(base, sp, { view: null })}
                    aria-current={view === "grid" ? "true" : undefined}
                    className={cn("inline-flex size-8 items-center justify-center rounded focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none", view === "grid" ? "bg-muted" : "hover:bg-muted/60")}
                  >
                    <LayoutGrid className="size-4" aria-hidden />
                    <span className="sr-only">Grid view</span>
                  </Link>
                  <Link
                    href={withParams(base, sp, { view: "list" })}
                    aria-current={view === "list" ? "true" : undefined}
                    className={cn("inline-flex size-8 items-center justify-center rounded focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none", view === "list" ? "bg-muted" : "hover:bg-muted/60")}
                  >
                    <List className="size-4" aria-hidden />
                    <span className="sr-only">List view</span>
                  </Link>
                </div>
              }
            >
              <FilterSelect param="kind" label="Type" allLabel="All types" options={kindOptions} />
              <FilterSelect param="visibility" label="Visibility" allLabel="Public and internal" options={visibilityOptions} />
              <FilterSelect param="consentStatus" label="Consent" allLabel="Any consent status" options={consentOptions} />
              {tagOptions.length > 0 && <FilterSelect param="tag" label="Tag" allLabel="Any tag" options={tagOptions} />}
              <FilterSelect param="status" label="Status" allLabel="Active" options={statusOptions} />
            </FilterBar>
            <FilterChips
              filters={[
                { param: "kind", label: "Type", options: kindOptions },
                { param: "visibility", label: "Visibility", options: visibilityOptions },
                { param: "consentStatus", label: "Consent", options: consentOptions },
                { param: "tag", label: "Tag" },
                { param: "status", label: "Status", options: statusOptions },
              ]}
            />
            <FilterPendingRegion>
              {view === "grid" ? (
                result.items.length === 0 ? (
                  empty
                ) : (
                  <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4" aria-label="Media items">
                    {result.items.map((item) => (
                      <li key={item.id}>
                        <Link
                          href={CONTENT_ADMIN_PATHS.mediaAsset(item.id)}
                          className="block h-full rounded-xl border bg-card p-2 transition-colors hover:border-foreground/30 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                        >
                          <Thumb item={item} />
                          <span className="mt-2 block truncate text-sm font-medium">{item.title}</span>
                          <span className="mt-0.5 block text-xs text-muted-foreground">
                            {MEDIA_KIND_LABELS[item.kind]} · {item.usageCount === 0 ? "Not used" : `Used in ${item.usageCount}`}
                          </span>
                          <span className="mt-1.5 block">
                            <Flags item={item} />
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )
              ) : (
                <DataTable
                  caption="Media items"
                  rows={result.items}
                  getRowId={(r) => r.id}
                  rowLink={(r) => ({ href: CONTENT_ADMIN_PATHS.mediaAsset(r.id), label: `Open ${r.title}` })}
                  empty={empty}
                  columns={[
                    {
                      id: "title",
                      header: "Item",
                      primary: true,
                      cell: (r) => (
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="w-16 shrink-0">
                            <Thumb item={r} />
                          </div>
                          <span className="truncate font-medium">{r.title}</span>
                        </div>
                      ),
                    },
                    { id: "kind", header: "Type", cell: (r) => MEDIA_KIND_LABELS[r.kind] },
                    { id: "flags", header: "Status", cell: (r) => <Flags item={r} /> },
                    { id: "usage", header: "Used in", align: "right", cell: (r) => r.usageCount },
                    { id: "createdAt", header: "Added", hideOnMobile: true, nowrap: true, cell: (r) => <RelativeTime value={r.createdAt} /> },
                  ]}
                />
              )}
              {result.pageCount > 1 && (
                <div className="mt-4">
                  <Pagination pathname={base} searchParams={sp} page={result.page} pageCount={result.pageCount} total={result.total} pageSize={result.pageSize} itemLabel="items" />
                </div>
              )}
            </FilterPendingRegion>
          </FilterScope>
        </div>
      </div>
    </div>
  );
}
