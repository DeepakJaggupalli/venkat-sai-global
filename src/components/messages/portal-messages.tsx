import "server-only";

import { notFound } from "next/navigation";

import { PortalBreadcrumb } from "@/components/layout/portal-breadcrumb";
import { Callout } from "@/components/shared/callout";
import { LinkTabs } from "@/components/shared/link-tabs";
import { PageHeader } from "@/components/shared/page-header";
import { Pagination } from "@/components/shared/pagination";
import { SectionCard } from "@/components/shared/section-card";
import { parsePage, sp, type SearchParams } from "@/lib/http";
import { THREAD_CONTEXT_LABELS } from "@/modules/operations/constants";
import { getThread, listThreads } from "@/modules/operations/queries";
import type { ThreadActor } from "@/modules/operations/threads";

import { DEFAULT_MESSAGES_LABELS, type MessagesLabels } from "./labels";
import { MarkThreadRead, MessageComposer } from "./message-composer";
import { getOwnParticipantState, staffAuthorIds } from "./participant-state";
import { ThreadControls } from "./thread-controls";
import { ThreadList, type ThreadListRow } from "./thread-list";
import { ThreadView } from "./thread-view";

/**
 * Messaging pages shared by the Employer, Partner, Institution and People portals and the staff inbox.
 * The page authorises first and builds the ThreadActor from its guard; the operations module scopes every
 * read to that actor (participants, the actor's organisation, or staff context permissions).
 */

export type MessagesPortal = "admin" | "employer" | "recruiter" | "institution" | "talent";

type Common = {
  actor: ThreadActor;
  portal: MessagesPortal;
  basePath: string;
  labels?: MessagesLabels;
  contextLabels?: Partial<Record<string, string>>;
  timeZone?: string;
  locale?: string;
};

export async function MessagesListView({
  actor,
  basePath,
  searchParams,
  labels = DEFAULT_MESSAGES_LABELS,
  contextLabels,
  timeZone,
  locale,
  newHref,
  describeRows,
}: Common & {
  searchParams: SearchParams;
  /** "New conversation" target (organisation portals and staff). */
  newHref?: string;
  /** Extra line per row (staff inbox: organisation names). */
  describeRows?: (organizationIds: string[]) => Promise<Map<string, string>>;
}) {
  const view = sp(searchParams, "view");
  const page = parsePage(searchParams, { defaultSize: 20, maxSize: 50 });
  const filters = view === "unread" ? { unreadOnly: true } : view === "closed" ? { status: "closed" as const } : {};
  const result = await listThreads(actor, filters, page);
  const orgNames = describeRows ? await describeRows([...new Set(result.items.map((t) => t.organizationId).filter((id): id is string => Boolean(id)))]) : null;
  const rows: ThreadListRow[] = result.items.map((t) => ({
    id: t.id,
    subject: t.subject,
    contextLabel: t.contextType === "general" ? null : (contextLabels?.[t.contextType] ?? THREAD_CONTEXT_LABELS[t.contextType]),
    meta: t.organizationId ? (orgNames?.get(t.organizationId) ?? null) : null,
    status: t.status,
    lastMessageAt: t.lastMessageAt,
    createdAt: t.createdAt,
    unreadCount: t.unreadCount,
    isMuted: t.isMuted,
  }));

  return (
    <div className="space-y-6">
      <PageHeader title={labels.title} description={labels.description} actions={newHref ? [{ label: labels.newConversation, href: newHref }] : undefined} />
      <LinkTabs
        label={labels.listCaption}
        items={[
          { href: basePath, label: labels.tabAll, match: "exact" },
          { href: `${basePath}?view=unread`, label: labels.tabUnread },
          { href: `${basePath}?view=closed`, label: labels.tabClosed },
        ]}
        activeHref={view === "unread" ? `${basePath}?view=unread` : view === "closed" ? `${basePath}?view=closed` : basePath}
      />
      <ThreadList
        rows={rows}
        basePath={basePath}
        timeZone={timeZone}
        locale={locale}
        labels={labels}
        filtered={Boolean(view) || page.page > 1}
        emptyAction={newHref ? { label: labels.newConversation, href: newHref } : undefined}
      />
      <Pagination pathname={basePath} searchParams={searchParams} page={result.page} pageCount={result.pageCount} total={result.total} pageSize={result.pageSize} itemLabel="conversations" />
    </div>
  );
}

export async function MessageDetailView({
  actor,
  portal,
  basePath,
  threadId,
  labels = DEFAULT_MESSAGES_LABELS,
  contextLabels,
  timeZone,
  locale,
  organizationId,
  aside,
}: Common & { threadId: string; organizationId?: string; aside?: React.ReactNode }) {
  const detail = await getThread(actor, threadId);
  if (!detail) notFound();
  const viewerId = actor.kind === "user" ? actor.user.id : actor.ctx.user.id;
  const [own, staffIds] = await Promise.all([
    getOwnParticipantState(threadId, viewerId),
    staffAuthorIds(detail.messages.map((m) => m.authorUserId).filter((id): id is string => Boolean(id))),
  ]);
  const { thread } = detail;
  const contextLabel = thread.contextType === "general" ? null : (contextLabels?.[thread.contextType] ?? THREAD_CONTEXT_LABELS[thread.contextType]);
  const activeParticipants = detail.participants.filter((p) => !p.removed);

  return (
    <div className="space-y-6">
      <PortalBreadcrumb items={[{ label: labels.title, href: basePath }, { label: thread.subject }]} />
      <MarkThreadRead portal={portal} threadId={thread.id} enabled />
      <PageHeader
        title={thread.subject}
        eyebrow={contextLabel ?? undefined}
        backLink={{ href: basePath, label: labels.backToMessages }}
        actions={
          <ThreadControls
            portal={portal}
            threadId={thread.id}
            isMuted={own ? own.isMuted : null}
            status={thread.status}
            canClose={actor.kind !== "user"}
            canReopen={actor.kind === "staff"}
            labels={labels}
          />
        }
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0 space-y-6">
          <SectionCard title={labels.conversation} headingLevel="h2">
            <ThreadView messages={detail.messages} staffUserIds={staffIds} timeZone={timeZone} locale={locale} labels={labels} highlightUnreadAfter={own?.lastReadAt ?? null} />
          </SectionCard>
          {thread.status === "closed" ? (
            <Callout tone="neutral">{labels.closedNotice}</Callout>
          ) : detail.canPost ? (
            <SectionCard title={labels.composerLabel} headingLevel="h2">
              <MessageComposer portal={portal} threadId={thread.id} organizationId={organizationId} labels={labels} />
            </SectionCard>
          ) : (
            <Callout tone="neutral">{labels.cannotPostNotice}</Callout>
          )}
        </div>
        <div className="space-y-6">
          <SectionCard title={labels.participants} headingLevel="h2">
            <ul className="space-y-2 text-sm">
              {activeParticipants.map((p) => (
                <li key={p.userId} className="flex items-center justify-between gap-2">
                  <span className="truncate text-foreground">{p.userId === viewerId ? labels.you : p.displayName}</span>
                  {p.isStaff ? <span className="shrink-0 rounded bg-navy px-1.5 py-0.5 text-[11px] font-medium text-white">{labels.staffBadge}</span> : null}
                </li>
              ))}
            </ul>
          </SectionCard>
          {aside}
        </div>
      </div>
    </div>
  );
}
