import { Archive, ArchiveRestore, ExternalLink, ImageIcon, Megaphone, Plus, Trash2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";

import { ActionButton } from "@/components/admin/action-button";
import { DataTable } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { LinkTabs } from "@/components/shared/link-tabs";
import { PageHeader } from "@/components/shared/page-header";
import { Pagination } from "@/components/shared/pagination";
import { RelativeTime } from "@/components/shared/relative-time";
import { StatusBadge } from "@/components/shared/status-badge";
import type { Tone } from "@/components/shared/tones";
import { Button } from "@/components/ui/button";
import type { CmsEntryStatus } from "@/db/schema";
import { parsePage, type SearchParams } from "@/lib/http";
import { CMS_ENTRY_STATUS_LABELS } from "@/modules/content/constants";
import { requireStaff, staffCan } from "@/modules/identity/authz";
import { listPosters, POSTER_PERMISSIONS } from "@/modules/recruitment-posters/service";

import { archivePosterAction, deletePosterAction, restorePosterAction } from "./actions";

export const metadata: Metadata = { title: "Requirement posters" };

const STATUS_TONE: Record<CmsEntryStatus, Tone> = { draft: "neutral", scheduled: "info", published: "success", archived: "warning" };

const statusSchema = z.enum(["draft", "scheduled", "published", "archived"]).optional().catch(undefined);

export default async function PostersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requireStaff("content.view");
  const sp = await searchParams;
  const status = statusSchema.parse(typeof sp.status === "string" ? sp.status : undefined);
  const page = parsePage(sp, { defaultSize: 20 });
  const result = await listPosters(ctx, { status }, page);
  const canPost = staffCan(ctx, [...POSTER_PERMISSIONS]);
  const canPublish = staffCan(ctx, "content.publish");
  const canEdit = staffCan(ctx, "content.edit");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Requirement posters"
        description="Recruitment posters shown under Latest requirements on the website. Post one from your phone in a few seconds."
        actions={
          canPost ? (
            <Button asChild size="lg" data-testid="post-requirement">
              <Link href="/admin/requirements/posters/new">
                <Plus aria-hidden="true" />
                Post requirement
              </Link>
            </Button>
          ) : null
        }
      />
      <LinkTabs
        label="Poster status"
        activeHref={status ? `/admin/requirements/posters?status=${status}` : "/admin/requirements/posters"}
        items={[
          { href: "/admin/requirements/posters", label: "All" },
          { href: "/admin/requirements/posters?status=published", label: "Published" },
          { href: "/admin/requirements/posters?status=draft", label: "Drafts" },
          { href: "/admin/requirements/posters?status=archived", label: "Archived" },
        ]}
      />
      <DataTable
        caption="Requirement posters"
        rows={result.items}
        getRowId={(p) => p.id}
        columns={[
          {
            id: "poster",
            header: "Poster",
            primary: true,
            cell: (p) => (
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-surface-subtle">
                  {p.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- private staff thumbnail served by the files module
                    <img src={p.thumbnailUrl} alt="" className="size-full object-cover" loading="lazy" />
                  ) : (
                    <ImageIcon className="size-6 text-muted-foreground" aria-hidden="true" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-foreground">{p.title}</p>
                  <p className="text-xs text-muted-foreground">{p.countryName ?? "No country"}</p>
                </div>
              </div>
            ),
          },
          { id: "status", header: "Status", cell: (p) => <StatusBadge tone={STATUS_TONE[p.status]} size="sm">{CMS_ENTRY_STATUS_LABELS[p.status]}</StatusBadge> },
          { id: "created", header: "Posted", hideOnMobile: true, cell: (p) => <RelativeTime value={p.publishedAt ?? p.createdAt} /> },
          {
            id: "actions",
            header: "Actions",
            cell: (p) => (
              <div className="flex flex-wrap gap-2">
                {p.status === "published" ? (
                  <Button asChild variant="outline" size="sm">
                    <Link href={p.publicPath} target="_blank" rel="noopener noreferrer">
                      <ExternalLink aria-hidden="true" />
                      View
                    </Link>
                  </Button>
                ) : null}
                <Button asChild variant="outline" size="sm">
                  <Link href={`/admin/content/requirement_posts/${p.id}`}>Edit</Link>
                </Button>
                {p.status === "published" && canPublish ? (
                  <ActionButton action={archivePosterAction.bind(null, { id: p.id })} icon={<Archive aria-hidden="true" />} testId="archive-poster">
                    Archive
                  </ActionButton>
                ) : null}
                {p.status === "archived" && canPost ? (
                  <ActionButton action={restorePosterAction.bind(null, { id: p.id })} icon={<ArchiveRestore aria-hidden="true" />} testId="restore-poster">
                    {canPublish ? "Unarchive" : "Unarchive (needs approval)"}
                  </ActionButton>
                ) : null}
                {canEdit ? (
                  <ActionButton
                    action={deletePosterAction.bind(null, { id: p.id })}
                    variant="destructive"
                    icon={<Trash2 aria-hidden="true" />}
                    testId="delete-poster"
                    confirm={{ title: `Delete "${p.title}"?`, description: "The poster is removed from the website and moved to the content bin.", confirmLabel: "Delete", destructive: true }}
                  >
                    Delete
                  </ActionButton>
                ) : null}
              </div>
            ),
          },
        ]}
        empty={
          <EmptyState
            icon={<Megaphone />}
            title="No requirement posters yet"
            description="Post a recruitment poster from your phone: choose the photo, add a title if you like, and publish."
            primaryAction={canPost ? { label: "Post requirement", href: "/admin/requirements/posters/new" } : undefined}
          />
        }
        footer={<Pagination pathname="/admin/requirements/posters" searchParams={sp} page={result.page} pageCount={result.pageCount} total={result.total} pageSize={result.pageSize} itemLabel="posters" />}
      />
    </div>
  );
}
