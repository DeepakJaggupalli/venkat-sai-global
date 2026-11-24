import { CircleAlert, ExternalLink, MessageSquareQuote, Send, Star } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import type { WorkerReviewStatus } from "@/db/schema/worker-reviews";
import { EmptyState } from "@/components/shared/empty-state";
import { LinkTabs } from "@/components/shared/link-tabs";
import { PageHeader } from "@/components/shared/page-header";
import { Pagination } from "@/components/shared/pagination";
import { env } from "@/lib/env";
import { parsePage, sp as pick, type SearchParams } from "@/lib/http";
import { requireStaff, staffCan } from "@/modules/identity/authz";
import { CV_SUBMISSION_STATUS_LABELS } from "@/modules/operations/cv-submission-schemas";
import { isWorkerReviewTab, WORKER_REVIEW_TAB_LABELS, WORKER_REVIEW_TABS, type WorkerReviewTab } from "@/modules/worker-reviews/schemas";
import { getReviewAskItem, listReviewAskQueue, listWorkerReviewsForStaff, workerReviewCounts, WORKER_REVIEWS_ADMIN_PATH, type ReviewAskLookup } from "@/modules/worker-reviews/service";

import { AskCard, StaffReviewCard } from "./_components/review-cards";

export const metadata: Metadata = { title: "Worker reviews" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const tabHref = (tab: WorkerReviewTab) => `${WORKER_REVIEWS_ADMIN_PATH}?tab=${tab}`;

/** The tab a review in this state is listed under. */
const TAB_OF_STATUS: Record<WorkerReviewStatus, WorkerReviewTab> = { pending: "pending", approved: "published", hidden: "published", rejected: "rejected" };

const EMPTY: Record<WorkerReviewTab, { title: string; description: string }> = {
  ask: {
    title: "Nobody to ask right now",
    description: "Workers appear here when their CV is set to Departed, until they send a review.",
  },
  pending: {
    title: "No reviews to approve",
    description: "Reviews that workers send through their link wait here until you approve them.",
  },
  published: {
    title: "No reviews on the website yet",
    description: "Approved reviews show here and on the Success stories page. You can hide them at any time.",
  },
  rejected: {
    title: "Nothing here",
    description: "Rejected reviews and private feedback (workers who did not allow us to show their review) are kept here.",
  },
};

/**
 * /admin/reviews — reviews from placed workers. Tabs: Ask for a review (departed workers without a review: send the
 * link on WhatsApp or copy it), To approve, Published (on the website or hidden) and Not shown. `?ask=<CV id>`
 * (linked from the CV page) puts that worker first, highlighted.
 */
export default async function WorkerReviewsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requireStaff("candidates.manage");
  const sp = await searchParams;
  const askParam = pick(sp, "ask");
  const askId = askParam && UUID.test(askParam) ? askParam.toLowerCase() : null;
  const counts = await workerReviewCounts(ctx);
  const requested = pick(sp, "tab");
  const tab: WorkerReviewTab = isWorkerReviewTab(requested) ? requested : askId ? "ask" : counts.pending > 0 ? "pending" : "ask";
  const page = parsePage(sp, { defaultSize: 20, maxSize: 50 });
  const canViewCv = staffCan(ctx, "candidates.view");
  // Dates in the viewer's zone (the server runs in UTC, which would show the day before for evenings in India).
  const timeZone = ctx.user.timezone ?? env().DEFAULT_TIMEZONE;

  const countFor: Record<WorkerReviewTab, number> = { ask: counts.ask, pending: counts.pending, published: counts.published, rejected: counts.rejected };
  const paginationParams: SearchParams = { tab, ...(askId && tab === "ask" ? { ask: askId } : {}), ...(page.page > 1 ? { page: String(page.page) } : {}) };

  let body: ReactNode;
  if (tab === "ask") {
    const [lookup, queue] = await Promise.all([askId ? getReviewAskItem(ctx, askId) : Promise.resolve(null), listReviewAskQueue(ctx, page, { excludeId: askId })]);
    body = (
      <div className="space-y-6">
        {lookup ? <AskLookupNotice lookup={lookup} canViewCv={canViewCv} /> : null}
        {lookup?.state === "eligible" ? <AskCard item={lookup.item} canViewCv={canViewCv} timeZone={timeZone} highlighted /> : null}
        {queue.items.length ? (
          <>
            <ul className="grid gap-4 lg:grid-cols-2" aria-label="Departed workers to ask for a review">
              {queue.items.map((item) => (
                <li key={item.submissionId}>
                  <AskCard item={item} canViewCv={canViewCv} timeZone={timeZone} />
                </li>
              ))}
            </ul>
            <Pagination pathname={WORKER_REVIEWS_ADMIN_PATH} searchParams={paginationParams} page={queue.page} pageCount={queue.pageCount} total={queue.total} pageSize={queue.pageSize} itemLabel="workers" />
          </>
        ) : lookup?.state === "eligible" ? null : (
          <EmptyState icon={<Send />} title={EMPTY.ask.title} description={EMPTY.ask.description} primaryAction={{ label: "Open CV submissions", href: "/admin/cv-submissions?status=departed" }} />
        )}
      </div>
    );
  } else {
    const list = await listWorkerReviewsForStaff(ctx, tab, page);
    body = list.items.length ? (
      <div className="space-y-6">
        <ul className="grid gap-4 lg:grid-cols-2" aria-label={WORKER_REVIEW_TAB_LABELS[tab]}>
          {list.items.map((review) => (
            <li key={review.id}>
              <StaffReviewCard review={review} timeZone={timeZone} />
            </li>
          ))}
        </ul>
        <Pagination pathname={WORKER_REVIEWS_ADMIN_PATH} searchParams={paginationParams} page={list.page} pageCount={list.pageCount} total={list.total} pageSize={list.pageSize} itemLabel="reviews" />
      </div>
    ) : (
      <EmptyState icon={tab === "pending" ? <MessageSquareQuote /> : <Star />} title={EMPTY[tab].title} description={EMPTY[tab].description} />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Worker reviews"
        description="Ask workers who have travelled for a review on WhatsApp. Their reviews show on the website only after you approve them, and only when the worker allowed it."
        actions={
          counts.published > 0 ? (
            <Link
              href="/success-stories#worker-reviews"
              target="_blank"
              rel="noopener"
              className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-white px-5 text-sm font-semibold text-foreground hover:bg-surface-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <ExternalLink className="size-4" aria-hidden="true" />
              See them on the website
              <span className="sr-only"> (opens in a new tab)</span>
            </Link>
          ) : undefined
        }
      />
      <LinkTabs
        label="Worker review sections"
        activeHref={tabHref(tab)}
        items={WORKER_REVIEW_TABS.map((t) => ({ href: tabHref(t), label: WORKER_REVIEW_TAB_LABELS[t], count: countFor[t] }))}
      />
      <h2 className="sr-only">{WORKER_REVIEW_TAB_LABELS[tab]}</h2>
      {body}
    </div>
  );
}

/** Why the worker from ?ask=<id> cannot be asked (or a short "here they are" note when they can). */
function AskLookupNotice({ lookup, canViewCv }: { lookup: ReviewAskLookup; canViewCv: boolean }) {
  if (lookup.state === "eligible") {
    return <p className="text-sm text-muted-foreground">The worker you opened from the CV page is first, highlighted.</p>;
  }
  const cvLink = (id: string, label: string) =>
    canViewCv ? (
      <Link href={`/admin/cv-submissions/${id}`} className="font-medium underline underline-offset-4">
        {label}
      </Link>
    ) : (
      label
    );
  const message =
    lookup.state === "not_found" ? (
      "This CV could not be found."
    ) : lookup.state === "reviewed" ? (
      <>
        {lookup.name} ({cvLink(lookup.submissionId, lookup.code)}) has already sent a review. It is in the{" "}
        <Link href={tabHref(TAB_OF_STATUS[lookup.reviewStatus])} className="font-medium underline underline-offset-4">
          {WORKER_REVIEW_TAB_LABELS[TAB_OF_STATUS[lookup.reviewStatus]]}
        </Link>{" "}
        tab.
      </>
    ) : (
      <>
        {lookup.name} ({cvLink(lookup.submissionId, lookup.code)}) is at the stage {CV_SUBMISSION_STATUS_LABELS[lookup.status]}. Set the stage to Departed on the CV page first, then ask for a review.
      </>
    );
  return (
    <p role="status" className="flex items-start gap-2 rounded-xl border border-border bg-surface-subtle p-4 text-sm text-foreground">
      <CircleAlert className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span>{message}</span>
    </p>
  );
}
