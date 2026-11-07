import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock, FileCheck2, ImageIcon, Layers, Megaphone, ShieldAlert } from "lucide-react";

import { DateText } from "@/components/shared/date-text";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { staffCan, requireStaff } from "@/modules/identity/authz";
import { getCollection } from "@/modules/content/collections";
import { CMS_COLLECTION_LABELS } from "@/modules/content/constants";
import { CONTENT_ADMIN_PATHS } from "@/modules/content/links";
import { countMediaNeedingConsent, listCollectionsOverview, listLogoPermissions, listScheduledContent } from "@/modules/content/queries";

export const metadata: Metadata = { title: "Website content" };

function next30Days(): { from: Date; to: Date } {
  const from = new Date();
  return { from, to: new Date(from.getTime() + 30 * 24 * 3600 * 1000) };
}

export default async function ContentHubPage() {
  const ctx = await requireStaff("content.view");
  const canBrowseMedia = staffCan(ctx, ["media.manage", "content.edit"], "any");
  const [overview, scheduled, mediaConsent, pendingLogos] = await Promise.all([
    listCollectionsOverview(ctx),
    listScheduledContent(ctx, next30Days()),
    canBrowseMedia ? countMediaNeedingConsent(ctx) : Promise.resolve(0),
    listLogoPermissions(ctx, { status: "pending" }, { page: 1, pageSize: 1, offset: 0 }),
  ]);
  const singletons = overview.filter((o) => o.singleton);
  const collections = overview.filter((o) => !o.singleton);
  const changes = collections.reduce((n, c) => n + c.withUnpublishedChanges, 0);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Website content"
        description="Edit the public website: pages, services, news, FAQs and more. Changes stay as drafts until you publish them."
        breadcrumbs={[{ label: "Command Centre", href: "/admin" }, { label: "Content" }]}
        actions={[
          ...(staffCan(ctx, "media.manage") ? [{ label: "Media library", href: CONTENT_ADMIN_PATHS.media, icon: <ImageIcon aria-hidden />, variant: "outline" as const }] : []),
          { label: "Logo permissions", href: CONTENT_ADMIN_PATHS.logoPermissions, icon: <FileCheck2 aria-hidden />, variant: "outline" as const },
        ]}
      />

      {(changes > 0 || mediaConsent > 0 || pendingLogos.total > 0) && (
        <ul className="grid gap-3 sm:grid-cols-3" aria-label="Needs attention">
          {changes > 0 && (
            <li className="rounded-xl border bg-warning-soft/60 p-4 text-sm">
              <p className="font-medium text-warning-strong">{changes === 1 ? "1 live entry has" : `${changes} live entries have`} unpublished changes</p>
              <p className="mt-1 text-muted-foreground">Open the collection and publish when ready.</p>
            </li>
          )}
          {mediaConsent > 0 && (
            <li className="rounded-xl border bg-warning-soft/60 p-4 text-sm">
              <p className="flex items-center gap-1.5 font-medium text-warning-strong">
                <ShieldAlert className="size-4" aria-hidden />
                {mediaConsent === 1 ? "1 media item needs" : `${mediaConsent} media items need`} consent
              </p>
              <Link href={`${CONTENT_ADMIN_PATHS.media}?consentStatus=pending`} className="mt-1 inline-block font-medium text-teal-strong underline-offset-2 hover:underline">
                Review in the media library
              </Link>
            </li>
          )}
          {pendingLogos.total > 0 && (
            <li className="rounded-xl border bg-info-soft/60 p-4 text-sm">
              <p className="font-medium text-info">{pendingLogos.total === 1 ? "1 logo permission awaits" : `${pendingLogos.total} logo permissions await`} review</p>
              <Link href={`${CONTENT_ADMIN_PATHS.logoPermissions}?status=pending`} className="mt-1 inline-block font-medium text-teal-strong underline-offset-2 hover:underline">
                Review permissions
              </Link>
            </li>
          )}
        </ul>
      )}

      <section aria-labelledby="site-pages" className="space-y-3">
        <h2 id="site-pages" className="font-heading text-lg font-semibold">
          Site-wide pages
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {singletons.map((s) => (
            <li key={s.collection}>
              <Link
                href={CONTENT_ADMIN_PATHS.collection(s.collection)}
                className="flex h-full flex-col rounded-xl border bg-card p-4 transition-colors hover:border-foreground/30 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <span className="font-heading font-semibold">{s.label}</span>
                <span className="mt-1 flex-1 text-sm text-muted-foreground">{getCollection(s.collection).description}</span>
                <span className="mt-3">
                  {s.published > 0 ? (
                    <StatusBadge tone="success" size="sm">Published</StatusBadge>
                  ) : s.total > 0 ? (
                    <StatusBadge tone="neutral" size="sm">Draft</StatusBadge>
                  ) : (
                    <StatusBadge tone="warning" size="sm">Not set up (built-in defaults shown)</StatusBadge>
                  )}
                  {s.withUnpublishedChanges > 0 && (
                    <StatusBadge tone="warning" size="sm" className="ml-1">
                      Unpublished changes
                    </StatusBadge>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="collections" className="space-y-3">
        <h2 id="collections" className="font-heading text-lg font-semibold">
          Collections
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {collections.map((c) => {
            const def = getCollection(c.collection);
            return (
              <li key={c.collection}>
                <Link
                  href={CONTENT_ADMIN_PATHS.collection(c.collection)}
                  className="flex h-full flex-col rounded-xl border bg-card p-4 transition-colors hover:border-foreground/30 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <span className="flex items-center gap-2 font-heading font-semibold">
                    <Layers className="size-4 text-teal" aria-hidden />
                    {c.label}
                    {def.consentRequired && (
                      <StatusBadge tone="info" size="sm">
                        Consent required
                      </StatusBadge>
                    )}
                  </span>
                  <span className="mt-1 flex-1 text-sm text-muted-foreground">{def.description}</span>
                  <span className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                    <span>
                      <span className="font-semibold tabular-nums">{c.published}</span> published
                    </span>
                    <span>
                      <span className="font-semibold tabular-nums">{c.drafts}</span> {c.drafts === 1 ? "draft" : "drafts"}
                    </span>
                    {c.scheduled > 0 && (
                      <span>
                        <span className="font-semibold tabular-nums">{c.scheduled}</span> scheduled
                      </span>
                    )}
                    {c.withUnpublishedChanges > 0 && <span className="text-warning-strong">{c.withUnpublishedChanges} with changes</span>}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title="Coming up in the next 30 days" icon={<CalendarClock aria-hidden />} flush>
          {scheduled.length === 0 ? (
            <EmptyState size="sm" variant="plain" title="Nothing scheduled" description="Use Schedule in an entry to publish or take it offline at a set time." />
          ) : (
            <ul className="divide-y">
              {scheduled.slice(0, 12).map((s) => (
                <li key={`${s.id}-${s.action}`} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
                  <span className="min-w-0">
                    <Link href={CONTENT_ADMIN_PATHS.entry(s.collection, s.id)} className="font-medium underline-offset-2 hover:underline">
                      {s.title}
                    </Link>
                    <span className="block text-xs text-muted-foreground">{CMS_COLLECTION_LABELS[s.collection]}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <StatusBadge tone={s.action === "publish" ? "brand" : "warning"} size="sm">
                      {s.action === "publish" ? "Publishes" : "Goes offline"}
                    </StatusBadge>
                    <DateText value={s.at} mode="datetime" />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
        <SectionCard title="Also managed here" flush>
          <ul className="divide-y text-sm">
            {staffCan(ctx, "announcements.manage") && (
              <li className="px-5 py-3">
                <Link href={CONTENT_ADMIN_PATHS.announcements} className="flex items-center gap-2 font-medium underline-offset-2 hover:underline">
                  <Megaphone className="size-4 text-teal" aria-hidden />
                  Announcements
                </Link>
                <p className="text-muted-foreground">Banners and notices for the website and portals.</p>
              </li>
            )}
            {staffCan(ctx, "metrics.public_manage") && (
              <li className="px-5 py-3">
                <Link href={CONTENT_ADMIN_PATHS.publicMetrics} className="font-medium underline-offset-2 hover:underline">
                  Public statistics
                </Link>
                <p className="text-muted-foreground">Live counts and approved figures shown on the homepage.</p>
              </li>
            )}
            <li className="px-5 py-3">
              <Link href={CONTENT_ADMIN_PATHS.logoPermissions} className="font-medium underline-offset-2 hover:underline">
                Logo permissions
              </Link>
              <p className="text-muted-foreground">Written permission evidence for every client or partner logo.</p>
            </li>
          </ul>
        </SectionCard>
      </div>
    </div>
  );
}
