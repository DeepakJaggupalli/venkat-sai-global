import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";

import { AnnouncementActions } from "@/components/cms/announcement-actions";
import { AnnouncementForm } from "@/components/cms/announcement-form";
import { Callout } from "@/components/shared/callout";
import { DateText } from "@/components/shared/date-text";
import { KeyValueList } from "@/components/shared/key-value-list";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { requireStaff } from "@/modules/identity/authz";
import { ANNOUNCEMENT_STATUS_LABELS } from "@/modules/content/constants";
import { CONTENT_ADMIN_PATHS } from "@/modules/content/links";
import { getAnnouncement } from "@/modules/content/queries";

export const metadata: Metadata = { title: "Announcement" };

type Params = Promise<{ id: string }>;

function isFuture(d: Date | null): boolean {
  return Boolean(d && d.getTime() > Date.now());
}

const STATUS_TONE = { draft: "neutral", scheduled: "brand", published: "success", expired: "warning", archived: "neutral" } as const;

export default async function AnnouncementPage({ params }: { params: Params }) {
  const ctx = await requireStaff("announcements.manage");
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const a = await getAnnouncement(ctx, id);
  if (!a) notFound();
  const editable = a.status === "draft" || a.status === "scheduled" || a.status === "published";

  return (
    <div className="space-y-6">
      <PageHeader
        title={a.title}
        breadcrumbs={[{ label: "Command Centre", href: "/admin" }, { label: "Announcements", href: CONTENT_ADMIN_PATHS.announcements }, { label: a.title }]}
        status={<StatusBadge tone={STATUS_TONE[a.status]}>{ANNOUNCEMENT_STATUS_LABELS[a.status]}</StatusBadge>}
      />
      {a.organizationName && (
        <Callout tone="info" title={`Requested by ${a.organizationName}`}>
          Partner announcements are approved in the approval centre. Edits here change what the partner submitted, so keep the meaning intact.
        </Callout>
      )}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <SectionCard title="Content and targeting">
          <AnnouncementForm
            disabled={!editable}
            values={{
              id: a.id,
              title: a.title,
              body: a.body,
              linkUrl: a.linkUrl,
              linkLabel: a.linkLabel,
              audience: a.audience,
              placements: a.placements,
              priority: a.priority,
              startsAt: a.startsAt?.toISOString() ?? null,
              endsAt: a.endsAt?.toISOString() ?? null,
              isDismissible: a.isDismissible,
            }}
          />
          {!editable && <p className="mt-4 text-sm text-muted-foreground">Restore it as a draft to edit it again.</p>}
        </SectionCard>
        <aside className="space-y-6" aria-label="Publishing">
          <SectionCard title="Publishing" headingLevel="h2">
            <div className="space-y-4">
              <KeyValueList
                dense
                columns={1}
                items={[
                  { label: "Published", value: a.publishedAt ? <DateText value={a.publishedAt} mode="datetime" /> : "Not yet" },
                  { label: "Starts", value: a.startsAt ? <DateText value={a.startsAt} mode="datetime" /> : "When published" },
                  { label: "Ends", value: a.endsAt ? <DateText value={a.endsAt} mode="datetime" /> : "When ended manually" },
                  { label: "Last updated", value: <DateText value={a.updatedAt} mode="datetime" /> },
                ]}
              />
              <AnnouncementActions id={a.id} status={a.status} everPublished={a.publishedAt !== null} startsInFuture={isFuture(a.startsAt)} />
            </div>
          </SectionCard>
        </aside>
      </div>
    </div>
  );
}
