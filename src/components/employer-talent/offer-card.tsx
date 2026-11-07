"use client";

import Link from "next/link";

import { FileLink } from "@/components/files";
import { DateText } from "@/components/shared/date-text";
import { MoneyText } from "@/components/shared/money-text";
import { StatusBadge } from "@/components/shared/status-badge";
import type { FileSummary } from "@/modules/files/types";
import { OFFER_STATUS_LABELS } from "@/modules/recruitment/constants";
import type { OfferView } from "@/modules/recruitment/types";

import { IssueOfferButton, WithdrawOfferButton } from "./offer-actions";
import { OfferFormDialog, type OfferFormOptions } from "./offer-forms";

const TONE: Record<string, "neutral" | "info" | "success" | "warning" | "danger"> = {
  draft: "neutral",
  issued: "info",
  accepted: "success",
  declined: "danger",
  withdrawn: "warning",
  expired: "warning",
};

const PERIOD: Record<string, string> = { hour: "per hour", day: "per day", week: "per week", month: "per month", year: "per year", project: "per project" };

export function OfferCard({ offer, offerFile, options, canManage, showCandidate = false, timeZone }: { offer: OfferView; offerFile: FileSummary | null; options: OfferFormOptions; canManage: boolean; showCandidate?: boolean; timeZone: string }) {
  const defaults = {
    offerId: offer.id,
    jobTitle: offer.jobTitle,
    salaryMinor: offer.salaryMinor,
    salaryCurrency: offer.salaryCurrency,
    salaryPeriod: offer.salaryPeriod,
    benefits: offer.benefits,
    countryCode: offer.countryCode,
    workLocation: offer.workLocation,
    startDate: offer.startDate,
    contractDurationMonths: offer.contractDurationMonths,
    offerFile,
    expiresAt: offer.expiresAt,
    internalNotes: offer.internalNotes,
  };
  return (
    <article className="space-y-3 rounded-xl border bg-card p-4" data-testid="offer-card">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-heading text-sm font-semibold">
            {offer.jobTitle} <span className="font-normal text-muted-foreground">· {offer.code}</span>
          </h3>
          {showCandidate ? (
            <p className="text-sm">
              <Link href={`/employer/pipeline/${offer.jobId}?application=${offer.applicationId}`} className="font-medium text-teal-strong underline-offset-4 hover:underline">
                {offer.candidateName}
              </Link>
            </p>
          ) : null}
        </div>
        <StatusBadge tone={TONE[offer.status] ?? "neutral"} size="sm">
          {OFFER_STATUS_LABELS[offer.status] ?? offer.status}
        </StatusBadge>
      </div>
      <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs text-muted-foreground">Salary</dt>
          <dd>
            {offer.salaryMinor !== null && offer.salaryCurrency ? (
              <>
                <MoneyText amountMinor={offer.salaryMinor} currency={offer.salaryCurrency} /> {offer.salaryPeriod ? PERIOD[offer.salaryPeriod] : ""}
              </>
            ) : (
              "Not stated"
            )}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Start date</dt>
          <dd>
            <DateText value={offer.startDate} dateOnly fallback="Not set" />
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Location</dt>
          <dd>{[offer.workLocation, offer.countryCode].filter(Boolean).join(", ") || "Not set"}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{offer.status === "issued" ? "Respond by" : offer.respondedAt ? "Responded" : "Created"}</dt>
          <dd>
            <DateText value={offer.status === "issued" ? offer.expiresAt : (offer.respondedAt ?? offer.createdAt)} timeZone={timeZone} fallback="No deadline" />
          </dd>
        </div>
      </dl>
      {offer.declineReason ? <p className="text-sm text-muted-foreground">Candidate&apos;s reason: {offer.declineReason}</p> : null}
      {offer.withdrawalReason ? <p className="text-sm text-muted-foreground">Withdrawn (internal): {offer.withdrawalReason}</p> : null}
      {offer.internalNotes ? <p className="text-sm text-muted-foreground">Internal notes: {offer.internalNotes}</p> : null}
      {offerFile ? <FileLink file={offerFile} /> : null}
      {canManage && (offer.status === "draft" || offer.status === "issued") ? (
        <div className="flex flex-wrap gap-2 border-t pt-3">
          {offer.status === "draft" ? (
            <>
              <IssueOfferButton offerId={offer.id} expiresAt={offer.expiresAt} />
              <OfferFormDialog mode="edit" defaults={defaults} options={options} />
            </>
          ) : (
            <>
              <OfferFormDialog mode="revise" defaults={defaults} options={options} />
              <WithdrawOfferButton offerId={offer.id} />
            </>
          )}
        </div>
      ) : null}
    </article>
  );
}
