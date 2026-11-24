import { Check, Lock, TriangleAlert } from "lucide-react";
import Link from "next/link";

import { Flag } from "@/components/public/flag";
import { ReviewStars } from "@/components/public/worker-reviews";
import { DateText } from "@/components/shared/date-text";
import { RelativeTime } from "@/components/shared/relative-time";
import { StatusBadge } from "@/components/shared/status-badge";
import { cn } from "@/lib/utils";
import { ratingText, WORKER_REVIEW_STATUS_LABELS, WORKER_REVIEW_STATUS_TONE } from "@/modules/worker-reviews/schemas";
import type { ReviewAskItem, StaffWorkerReview } from "@/modules/worker-reviews/service";

import { AskButtons } from "./ask-buttons";
import { DecisionButtons } from "./decision-buttons";

/** A departed worker to ask for a review: who, trade, country, when they left, whether someone already asked. */
export function AskCard({ item, canViewCv, timeZone, highlighted = false }: { item: ReviewAskItem; canViewCv: boolean; timeZone?: string; highlighted?: boolean }) {
  const nameId = `ask-${item.submissionId}-name`;
  return (
    <article
      id={`ask-${item.submissionId}`}
      aria-labelledby={nameId}
      className={cn("flex h-full scroll-mt-24 flex-col gap-3 rounded-2xl border bg-card p-4 shadow-xs sm:p-5", highlighted ? "border-teal ring-2 ring-teal/40" : "border-border")}
      data-testid="review-ask-item"
    >
      <div className="min-w-0">
        <h3 id={nameId} className="font-heading text-lg font-semibold break-words text-foreground">
          {canViewCv ? (
            <Link href={`/admin/cv-submissions/${item.submissionId}`} className="underline-offset-4 hover:underline">
              {item.name}
            </Link>
          ) : (
            item.name
          )}
        </h3>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
          <span className="tabular-nums">{item.code}</span>
          <span aria-hidden="true">·</span>
          <span>{item.tradeLabel}</span>
          {item.countryName ? (
            <>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1.5">
                <Flag code={item.countryCode} />
                {item.countryName}
              </span>
            </>
          ) : null}
        </p>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Departed <DateText value={item.departedAt} timeZone={timeZone} />
        </p>
      </div>
      <p className="text-sm">
        {item.lastAskedAt ? (
          <span className="inline-flex flex-wrap items-center gap-1.5 text-foreground">
            <Check className="size-4 text-success-strong" aria-hidden="true" />
            Asked <RelativeTime value={item.lastAskedAt} />
            {item.lastAskedByName ? ` by ${item.lastAskedByName}` : ""}
            {item.lastAskedChannel === "whatsapp" ? " on WhatsApp" : ""}
            {item.askCount > 1 ? ` (${item.askCount} times)` : ""}
          </span>
        ) : (
          <span className="text-muted-foreground">Not asked yet</span>
        )}
      </p>
      {item.whatsappUrl ? null : (
        <p className="text-xs text-muted-foreground">
          Phone {item.phoneMasked} is hidden: sending on WhatsApp needs the permission to view candidate contact details. You can copy the link instead.
        </p>
      )}
      <div className="mt-auto pt-1">
        <AskButtons submissionId={item.submissionId} name={item.name} whatsappUrl={item.whatsappUrl} reviewUrl={item.reviewUrl} />
      </div>
    </article>
  );
}

/** A review as staff see it: stars, the worker's words, what will be shown, consent, warnings and the decisions. */
export function StaffReviewCard({ review, timeZone }: { review: StaffWorkerReview; timeZone?: string }) {
  const byId = `review-${review.id}-by`;
  return (
    <article aria-labelledby={byId} className="flex h-full flex-col gap-4 rounded-2xl border border-border bg-card p-4 shadow-xs sm:p-5" data-testid="staff-review">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <ReviewStars rating={review.rating} />
          <span className="text-sm font-medium text-foreground">{ratingText(review.rating)}</span>
        </div>
        <StatusBadge tone={WORKER_REVIEW_STATUS_TONE[review.status]} size="sm">
          {WORKER_REVIEW_STATUS_LABELS[review.status]}
        </StatusBadge>
      </div>
      <p dir="auto" className="text-base leading-7 break-words whitespace-pre-line text-foreground">
        {review.body}
      </p>
      <div className="text-sm">
        <p id={byId} dir="auto" className="font-semibold break-words text-foreground">
          {review.displayName}
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground">
          <span className="break-words">{review.trade}</span>
          {review.countryName ? (
            <>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1.5">
                <Flag code={review.countryCode} />
                {review.countryName}
              </span>
            </>
          ) : null}
        </p>
      </div>
      {!review.consentToPublish ? (
        <p className="flex items-start gap-2 rounded-xl bg-surface-subtle p-3 text-sm text-foreground">
          <Lock className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          Private feedback: the worker did not allow us to show it on the website.
        </p>
      ) : review.mentionsContactDetails && review.status !== "rejected" ? (
        <p className="flex items-start gap-2 rounded-xl bg-warning-soft p-3 text-sm text-foreground">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning-strong" aria-hidden="true" />
          It may contain a phone number, email or link. Check it before it goes on the website.
        </p>
      ) : null}
      <p className="text-xs text-muted-foreground">
        Received <DateText value={review.createdAt} timeZone={timeZone} />
        {review.reviewedAt ? (
          <>
            {" "}
            · updated <DateText value={review.reviewedAt} timeZone={timeZone} />
            {review.reviewedByName ? ` by ${review.reviewedByName}` : ""}
          </>
        ) : null}
        {review.cv ? (
          <>
            {" "}
            ·{" "}
            <Link href={`/admin/cv-submissions/${review.cv.id}`} className="font-medium text-foreground underline underline-offset-4">
              CV {review.cv.code}
            </Link>{" "}
            ({review.cv.name})
          </>
        ) : null}
      </p>
      <div className="mt-auto">
        <DecisionButtons id={review.id} status={review.status} consentToPublish={review.consentToPublish} who={review.displayName} />
      </div>
    </article>
  );
}
