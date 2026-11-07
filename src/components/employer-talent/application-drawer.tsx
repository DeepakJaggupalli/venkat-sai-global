"use client";

import { Flag, UserRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { FileLink } from "@/components/files";
import { DateText } from "@/components/shared/date-text";
import { MoneyText } from "@/components/shared/money-text";
import { StatusBadge } from "@/components/shared/status-badge";
import type { SelectOption } from "@/components/shared/types";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { FileSummary } from "@/modules/files/types";
import type { EmployerApplicationDetail } from "@/modules/recruitment/types";

import { NotesPanel, ReviewControls, StageMoveForm } from "./drawer-parts";
import { InterviewCard } from "./interview-card";
import { ScheduleInterviewDialog, type Me } from "./interview-forms";
import { formatExperience, labelFor, PLACEMENT_STATUS_LABELS, VERIFICATION_LEVEL_LABELS } from "./labels";
import { OfferCard } from "./offer-card";
import { OfferFormDialog, type OfferFormOptions } from "./offer-forms";
import { RequestDialog } from "./request-dialog";

export type DrawerData = {
  detail: EmployerApplicationDetail;
  resume: FileSummary | null;
  offerFiles: Record<string, FileSummary>;
  canManage: boolean;
  canInterview: boolean;
  canOffer: boolean;
  timeZone: string;
  timeZones: SelectOption[];
  me: Me;
  offerOptions: OfferFormOptions;
  /** The job's advertised pay terms and place: offer defaults when the candidate stated no expected salary. */
  jobTerms?: { salaryCurrency: string | null; salaryPeriod: string | null; countryCode: string | null; city: string | null };
};

const PERIOD: Record<string, string> = { hour: "per hour", day: "per day", week: "per week", month: "per month", year: "per year", project: "per project" };

function answerText(value: unknown): string {
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (value === null || value === undefined || value === "") return "No answer";
  return String(value);
}

/**
 * Application drawer on the per-job pipeline, opened by `?application=<id>` (the link the recruitment
 * module sends in notifications). Closing removes the parameter.
 */
export function ApplicationDrawer({ data, closeHref }: { data: DrawerData; closeHref: string }) {
  const router = useRouter();
  const { detail, canManage } = data;
  const app = detail.application;
  const card = detail.candidate;
  const name = card?.displayName ?? "Candidate";
  const openOffer = detail.offers.find((o) => o.status === "draft" || o.status === "issued");
  const isOpen = app.status === "active";
  const nextRound = detail.interviews.filter((i) => i.status !== "cancelled").length + 1;
  // A salary needs a currency and a period: start from the candidate's expectation, else the job's own terms
  // (never an assumed currency).
  const expected = app.expectedSalary;
  const offerDefaults = {
    jobTitle: detail.job.title,
    salaryMinor: expected?.amountMinor ?? null,
    salaryCurrency: expected?.currency ?? data.jobTerms?.salaryCurrency ?? null,
    salaryPeriod: expected?.period ?? data.jobTerms?.salaryPeriod ?? null,
    benefits: null,
    countryCode: data.jobTerms?.countryCode ?? null,
    workLocation: data.jobTerms?.city ?? null,
    startDate: null,
    contractDurationMonths: null,
    offerFile: null,
    expiresAt: null,
    internalNotes: null,
  };

  return (
    <Sheet open onOpenChange={(open) => (open ? undefined : router.push(closeHref, { scroll: false }))}>
      <SheetContent side="right" className="w-full overflow-y-auto data-[side=right]:sm:max-w-2xl" aria-describedby="application-drawer-description">
        <SheetHeader className="border-b pb-4">
          <p className="text-xs text-muted-foreground">
            {app.code} · {detail.job.title}
          </p>
          <SheetTitle className="font-heading text-xl">{name}</SheetTitle>
          <SheetDescription id="application-drawer-description">
            {card?.headline ?? card?.currentJobTitle ?? "Application"} · applied <DateText value={app.createdAt} timeZone={data.timeZone} />
          </SheetDescription>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <StatusBadge tone="info" size="sm" srPrefix="Stage:">
              {detail.stage.name}
            </StatusBadge>
            <StatusBadge tone="neutral" size="sm">
              {app.source === "direct" ? "Applied directly" : "Via Venkat Sai"}
            </StatusBadge>
            {card ? (
              <Link href={`/employer/candidates/${card.candidateId}`} className="inline-flex items-center gap-1 text-sm text-teal-strong underline-offset-4 hover:underline">
                <UserRound aria-hidden className="size-4" />
                Full profile
              </Link>
            ) : null}
          </div>
        </SheetHeader>

        <div className="space-y-5 px-4 pb-8">
          <ReviewControls applicationId={app.id} rating={app.rating} isShortlisted={app.isShortlisted} canManage={canManage && isOpen} />

          <Tabs defaultValue="overview">
            <TabsList className="w-full flex-wrap justify-start">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="answers">Answers ({detail.answers.length})</TabsTrigger>
              <TabsTrigger value="activity">Activity</TabsTrigger>
              <TabsTrigger value="notes">Notes ({detail.notes.length})</TabsTrigger>
              <TabsTrigger value="interviews">Interviews ({detail.interviews.length})</TabsTrigger>
              <TabsTrigger value="offers">Offers ({detail.offers.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-5 pt-4">
              {app.knockoutFlags.length ? (
                <div className="rounded-lg border border-warning/40 bg-warning-soft p-3 text-sm">
                  <p className="flex items-center gap-1.5 font-medium text-warning-strong">
                    <Flag aria-hidden className="size-4" />
                    {app.knockoutFlags.length} {app.knockoutFlags.length === 1 ? "answer needs" : "answers need"} a look
                  </p>
                  <ul className="mt-1 list-disc pl-5">
                    {app.knockoutFlags.map((f, i) => (
                      <li key={`${f.questionId ?? i}`}>
                        {f.question}: {answerText(f.answer)} <span className="text-muted-foreground">({f.reason})</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1 text-xs text-muted-foreground">Flags never reject automatically. Review before deciding.</p>
                </div>
              ) : null}

              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-muted-foreground">Location</dt>
                  <dd>{[card?.city, card?.stateRegion, card?.countryCode].filter(Boolean).join(", ") || "Not shared"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Experience</dt>
                  <dd>{formatExperience(card?.totalExperienceMonths ?? null)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Verification</dt>
                  <dd>{labelFor(VERIFICATION_LEVEL_LABELS, card?.verificationLevel, "Not yet verified")}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Expected salary</dt>
                  <dd>
                    {app.expectedSalary ? (
                      <>
                        <MoneyText amountMinor={app.expectedSalary.amountMinor} currency={app.expectedSalary.currency} /> {PERIOD[app.expectedSalary.period] ?? ""}
                      </>
                    ) : (
                      "Not stated"
                    )}
                  </dd>
                </div>
                {card?.skills.length ? (
                  <div className="sm:col-span-2">
                    <dt className="text-xs text-muted-foreground">Skills</dt>
                    <dd>{card.skills.join(", ")}</dd>
                  </div>
                ) : null}
                <div className="sm:col-span-2">
                  <dt className="text-xs text-muted-foreground">Resume</dt>
                  <dd>{data.resume ? <FileLink file={data.resume} /> : "No resume attached"}</dd>
                </div>
              </dl>

              {app.coverLetter ? (
                <section aria-labelledby="cover-letter-heading">
                  <h3 id="cover-letter-heading" className="mb-1 font-heading text-sm font-semibold">
                    Cover letter
                  </h3>
                  <p className="text-sm whitespace-pre-line text-foreground/90">{app.coverLetter}</p>
                </section>
              ) : null}

              {detail.placement ? (
                <p className="rounded-lg bg-surface-subtle p-3 text-sm">
                  Placement {detail.placement.code}: {labelFor(PLACEMENT_STATUS_LABELS, detail.placement.status)}.{" "}
                  <Link href="/employer/offers?tab=placements" className="text-teal-strong underline-offset-4 hover:underline">
                    View placements
                  </Link>
                </p>
              ) : null}

              {canManage && isOpen ? (
                <section aria-labelledby="actions-heading" className="space-y-3 rounded-xl border p-4">
                  <h3 id="actions-heading" className="font-heading text-sm font-semibold">
                    Actions
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {data.canInterview ? <ScheduleInterviewDialog applicationId={app.id} candidateName={name} me={data.me} timeZones={data.timeZones} defaultTimeZone={data.timeZone} nextRound={nextRound} /> : null}
                    <RequestDialog kind="assessment" candidateLabel={`${name} (${app.code})`} profilePath={`/employer/pipeline/${detail.job.id}?application=${app.id}`} applicationId={app.id} />
                    {data.canOffer && !openOffer ? <OfferFormDialog mode="create" applicationId={app.id} defaults={offerDefaults} options={data.offerOptions} /> : null}
                  </div>
                  <StageMoveForm applicationId={app.id} candidateName={name} allowed={detail.allowedTargets} />
                </section>
              ) : null}
            </TabsContent>

            <TabsContent value="answers" className="pt-4">
              {detail.answers.length === 0 ? (
                <p className="text-sm text-muted-foreground">This job had no screening questions.</p>
              ) : (
                <dl className="space-y-3">
                  {detail.answers.map((a, i) => (
                    <div key={a.questionId ?? i} className="rounded-lg border p-3">
                      <dt className="text-sm font-medium">{a.question}</dt>
                      <dd className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                        {answerText(a.answer)}
                        {a.isFlagged ? (
                          <StatusBadge tone="warning" size="sm">
                            Flagged for review
                          </StatusBadge>
                        ) : null}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
            </TabsContent>

            <TabsContent value="activity" className="pt-4">
              <p className="mb-3 text-xs text-muted-foreground">Each step shows what the candidate saw and, separately, your team&apos;s internal note.</p>
              <ol className="space-y-3">
                {[...detail.history].reverse().map((h) => (
                  <li key={h.id} className="space-y-1.5 border-l-2 border-teal/40 pl-3">
                    <p className="text-sm">
                      <span className="font-medium">{h.to.name}</span>
                      {h.from ? <span className="text-muted-foreground"> from {h.from.name}</span> : null}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {h.changedByType === "employer" ? (h.changedByName ?? "Your team") : h.changedByType === "candidate" ? "Candidate" : "Venkat Sai"} · <DateText value={h.createdAt} mode="datetime" timeZone={data.timeZone} />
                    </p>
                    <p className="text-xs">
                      <StatusBadge tone="info" size="sm">
                        Candidate saw
                      </StatusBadge>{" "}
                      {h.to.candidateLabel}
                      {h.candidateVisibleNote ? `: “${h.candidateVisibleNote}”` : ""}
                    </p>
                    {h.note ? (
                      <p className="text-xs">
                        <StatusBadge tone="neutral" size="sm">
                          Internal
                        </StatusBadge>{" "}
                        {h.note}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ol>
            </TabsContent>

            <TabsContent value="notes" className="pt-4">
              <NotesPanel applicationId={app.id} notes={detail.notes} canWrite={canManage} />
            </TabsContent>

            <TabsContent value="interviews" className="space-y-3 pt-4">
              {detail.interviews.length === 0 ? <p className="text-sm text-muted-foreground">No interviews yet.</p> : null}
              {detail.interviews.map((i) => (
                <InterviewCard key={i.id} interview={i} viewerTimeZone={data.timeZone} timeZones={data.timeZones} meUserId={data.me.userId} canManage={data.canInterview} />
              ))}
              {data.canInterview && canManage && isOpen ? (
                <ScheduleInterviewDialog applicationId={app.id} candidateName={name} me={data.me} timeZones={data.timeZones} defaultTimeZone={data.timeZone} nextRound={nextRound} />
              ) : null}
            </TabsContent>

            <TabsContent value="offers" className="space-y-3 pt-4">
              {detail.offers.length === 0 ? <p className="text-sm text-muted-foreground">No offers yet.</p> : null}
              {detail.offers.map((o) => (
                <OfferCard key={o.id} offer={o} offerFile={o.offerFileId ? (data.offerFiles[o.offerFileId] ?? null) : null} options={data.offerOptions} canManage={data.canOffer} timeZone={data.timeZone} />
              ))}
              {data.canOffer && isOpen && !openOffer ? <OfferFormDialog mode="create" applicationId={app.id} defaults={offerDefaults} options={data.offerOptions} /> : null}
            </TabsContent>
          </Tabs>
        </div>
      </SheetContent>
    </Sheet>
  );
}
