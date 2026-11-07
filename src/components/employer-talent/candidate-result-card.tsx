import { Award, BadgeCheck, Briefcase, Clock, Globe2, Languages, MapPin } from "lucide-react";
import Link from "next/link";

import { MoneyText } from "@/components/shared/money-text";
import { RelativeTime } from "@/components/shared/relative-time";
import { StatusBadge } from "@/components/shared/status-badge";
import { SALARY_PERIOD_LABELS } from "@/components/employer/labels";
import type { CandidateCard } from "@/modules/candidates/types";

import { AddToListDialog, type ListChoice } from "./add-to-list-dialog";
import { CompareToggle } from "./compare-selection";
import { AVAILABILITY_LABELS, formatExperience, formatPlace, labelFor, PASSPORT_STATUS_LABELS } from "./labels";
import { VerificationLevelBadge } from "./verification-level-badge";

/** One masked search result: no contact details, no photo, initials unless the candidate shows their name. */
export function CandidateResultCard({ card, lists, canUseLists }: { card: CandidateCard; lists: ListChoice[]; canUseLists: boolean }) {
  const href = `/employer/candidates/${card.candidateId}`;
  const title = card.headline ?? card.currentJobTitle ?? "Candidate";
  return (
    <article className="relative flex flex-col gap-3 rounded-xl border bg-card p-4 transition-shadow focus-within:ring-2 focus-within:ring-ring hover:shadow-sm sm:p-5" data-testid="candidate-card">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-heading text-base font-semibold text-foreground">
            <Link href={href} className="after:absolute after:inset-0 focus-visible:outline-none">
              {card.displayName}
              <span className="sr-only">, view profile</span>
            </Link>
          </h3>
          {card.nameMasked ? <p className="text-xs text-muted-foreground">Name shown after the candidate applies or you unlock the profile</p> : null}
          <p className="mt-1 line-clamp-2 text-sm text-foreground/90">{title}</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <VerificationLevelBadge level={card.verificationLevel} />
          {card.relationship.applied ? <StatusBadge tone="brand" size="sm">Applied to your job</StatusBadge> : null}
          {card.relationship.unlocked ? <StatusBadge tone="gold" size="sm">Unlocked</StatusBadge> : null}
        </div>
      </div>

      <ul className="grid gap-x-4 gap-y-1.5 text-sm text-muted-foreground sm:grid-cols-2">
        <li className="flex items-center gap-1.5">
          <MapPin aria-hidden className="size-4 shrink-0" />
          <span className="truncate">{formatPlace(card.location)}</span>
        </li>
        <li className="flex items-center gap-1.5">
          <Briefcase aria-hidden className="size-4 shrink-0" />
          <span>Experience: {formatExperience(card.totalExperienceMonths)}</span>
        </li>
        <li className="flex items-center gap-1.5">
          <Clock aria-hidden className="size-4 shrink-0" />
          <span>{labelFor(AVAILABILITY_LABELS, card.availability, "Availability not shared")}</span>
        </li>
        <li className="flex items-center gap-1.5">
          <Globe2 aria-hidden className="size-4 shrink-0" />
          <span>
            {card.openToOverseas ? "Open to overseas work" : "Prefers home country"}
            {card.passportStatus ? ` · ${labelFor(PASSPORT_STATUS_LABELS, card.passportStatus)}` : ""}
          </span>
        </li>
        {card.languages.length ? (
          <li className="flex items-center gap-1.5 sm:col-span-2">
            <Languages aria-hidden className="size-4 shrink-0" />
            <span className="truncate">{card.languages.join(", ")}</span>
          </li>
        ) : null}
      </ul>

      {card.skills.length ? (
        <ul aria-label="Skills" className="flex flex-wrap gap-1.5">
          {card.skills.slice(0, 8).map((s) => (
            <li key={s} className="rounded-full bg-surface-subtle px-2.5 py-0.5 text-xs text-foreground">
              {s}
            </li>
          ))}
          {card.skills.length > 8 ? <li className="px-1 text-xs text-muted-foreground">+{card.skills.length - 8} more</li> : null}
        </ul>
      ) : null}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        {card.passedAssessmentCount > 0 ? (
          <span className="inline-flex items-center gap-1 text-success-strong">
            <Award aria-hidden className="size-4" />
            {card.passedAssessmentCount} Venkat Sai {card.passedAssessmentCount === 1 ? "assessment" : "assessments"} passed
          </span>
        ) : null}
        {card.verifiedCredentialCount > 0 ? (
          <span className="inline-flex items-center gap-1 text-success-strong">
            <BadgeCheck aria-hidden className="size-4" />
            {card.verifiedCredentialCount} verified {card.verifiedCredentialCount === 1 ? "credential" : "credentials"}
          </span>
        ) : null}
        {card.expectedSalary ? (
          <span className="text-muted-foreground">
            Expects <MoneyText amountMinor={card.expectedSalary.amountMinor} currency={card.expectedSalary.currency} className="font-medium text-foreground" />{" "}
            {labelFor(SALARY_PERIOD_LABELS, card.expectedSalary.period, "").toLowerCase()}
          </span>
        ) : null}
      </div>

      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t pt-3">
        <p className="text-xs text-muted-foreground">
          {card.lastActiveAt ? (
            <>
              Active <RelativeTime value={card.lastActiveAt} />
            </>
          ) : (
            "Activity not available"
          )}
        </p>
        <div className="relative z-10 flex items-center gap-3">
          <CompareToggle candidateId={card.candidateId} name={card.displayName} />
          {canUseLists ? <AddToListDialog candidateIds={[card.candidateId]} lists={lists} /> : null}
        </div>
      </div>
    </article>
  );
}
