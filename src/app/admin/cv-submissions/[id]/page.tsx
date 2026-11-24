import { Download, Eye, FileStack, MessageCircle, Phone, ReceiptText, Stamp, Star } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ActionForm } from "@/components/admin/action-form";
import { DateText } from "@/components/shared/date-text";
import { KeyValueList } from "@/components/shared/key-value-list";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { sp as pick, type SearchParams } from "@/lib/http";
import { requireStaff, staffCan } from "@/modules/identity/authz";
import {
  CV_INVOICE_STATUSES,
  CV_SUBMISSION_SOURCE_LABELS,
  CV_SUBMISSION_STATUS_LABELS,
  CV_SUBMISSION_STATUS_TONE,
  CV_SUBMISSION_STATUS_VALUES,
} from "@/modules/operations/cv-submission-schemas";
import { listCvSubmissionDocuments } from "@/modules/operations/cv-submission-documents";
import { getCvSubmission } from "@/modules/operations/cv-submissions";

import { askForCvWhatsApp, candidateWhatsApp } from "../_components/applicant-columns";
import { setCvSubmissionRemarksAction, setCvSubmissionStatusAction } from "../actions";
import { AttachCvForm } from "./_components/attach-cv-form";
import { DocumentsCard } from "./_components/documents-card";

export const metadata: Metadata = { title: "CV submission" };

const statusOptions = CV_SUBMISSION_STATUS_VALUES.map((value) => ({ value, label: CV_SUBMISSION_STATUS_LABELS[value] }));

function yearsText(value: number | null): string {
  return value === null ? "Not given" : `${value} ${value === 1 ? "year" : "years"}`;
}

export default async function CvSubmissionPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> }) {
  const ctx = await requireStaff("candidates.view");
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const s = await getCvSubmission(ctx, id, { revealPassport: pick(sp, "reveal") === "passport" });
  if (!s) notFound();
  const canManage = staffCan(ctx, "candidates.manage");
  const canOpenDocuments = staffCan(ctx, ["candidates.view_documents", "recruitment.manage"], "any");
  const canInvoice = staffCan(ctx, "commercial.invoices") && CV_INVOICE_STATUSES.includes(s.status);
  const canAskReview = canManage && s.status === "departed";
  const canSeePosters = staffCan(ctx, "content.view");
  const documents = await listCvSubmissionDocuments(ctx, s.id);
  const wordCv = s.cvMimeType === "application/msword" || s.cvMimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  const whatsapp = candidateWhatsApp(s);
  const askCv = !s.hasCv ? askForCvWhatsApp(s) : null;
  const splitGiven = s.experienceAbroadYears !== null || s.experienceIndiaYears !== null;

  const passport = s.passportNumber ? (
    <span className="font-mono font-semibold" data-testid="passport-full">
      {s.passportNumber}
    </span>
  ) : s.passportLast4 ? (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span className="font-mono">{s.passportDisplay}</span>
      {s.canRevealPassport ? (
        <Button asChild variant="outline" size="sm" className="min-h-11 md:min-h-7">
          <Link href={`/admin/cv-submissions/${s.id}?reveal=passport`} data-testid="reveal-passport">
            <Eye aria-hidden="true" />
            Show full number (logged)
          </Link>
        </Button>
      ) : null}
    </span>
  ) : s.hasPassport === true ? (
    "Yes (number not given)"
  ) : s.hasPassport === false ? (
    "No"
  ) : (
    "Not answered"
  );

  const cvValue = s.cvUrl ? (
    <div className="space-y-3">
      <Button asChild variant="outline" size="sm" className="min-h-11 md:min-h-7">
        <a href={s.cvUrl} data-testid="cv-download">
          <Download aria-hidden="true" />
          Download {s.cvName ?? "CV"}
        </a>
      </Button>
      {canManage ? <AttachCvForm submissionId={s.id} replace /> : null}
    </div>
  ) : !s.hasCv ? (
    <div className="space-y-3" data-testid="no-cv">
      <p className="font-medium text-foreground">No CV yet, ask on WhatsApp.</p>
      {askCv ? (
        <Button asChild size="sm" className="min-h-11 md:min-h-8">
          <a href={askCv} target="_blank" rel="noopener noreferrer" data-testid="ask-cv-whatsapp">
            <MessageCircle aria-hidden="true" />
            Ask for the CV on WhatsApp
          </a>
        </Button>
      ) : null}
      {canManage ? <AttachCvForm submissionId={s.id} /> : null}
    </div>
  ) : s.cvBlocked ? (
    // Still being scanned, failed the scan or the file was removed: a clean copy (e.g. from WhatsApp) can replace it.
    <div className="space-y-3" data-testid="cv-blocked">
      <p className="text-foreground">The CV is waiting for the security scan, did not pass it, or was removed.</p>
      {canManage ? <AttachCvForm submissionId={s.id} replace /> : null}
    </div>
  ) : (
    "You do not have access to CVs"
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={s.name}
        eyebrow={s.code}
        backLink={{ href: "/admin/cv-submissions", label: "Applicants and CVs" }}
        status={<StatusBadge tone={CV_SUBMISSION_STATUS_TONE[s.status]}>{CV_SUBMISSION_STATUS_LABELS[s.status]}</StatusBadge>}
        actions={
          <div className="flex flex-wrap gap-2">
            {whatsapp ? (
              <>
                <Button asChild className="min-h-11 md:min-h-8">
                  <a href={whatsapp} target="_blank" rel="noopener noreferrer">
                    <MessageCircle aria-hidden="true" />
                    WhatsApp
                  </a>
                </Button>
                <Button asChild variant="outline" className="min-h-11 md:min-h-8">
                  <a href={`tel:${s.phone}`}>
                    <Phone aria-hidden="true" />
                    Call
                  </a>
                </Button>
              </>
            ) : null}
            {canOpenDocuments ? (
              <>
                <Button asChild variant="outline" className="min-h-11 md:min-h-8">
                  <a href={`/admin/cv-submissions/${s.id}/pack?type=cv`} data-testid="cv-pack-download">
                    <FileStack aria-hidden="true" />
                    Download CV pack
                  </a>
                </Button>
                <Button asChild variant="outline" className="min-h-11 md:min-h-8">
                  <a href={`/admin/cv-submissions/${s.id}/pack?type=visa`} data-testid="visa-pack-download">
                    <Stamp aria-hidden="true" />
                    Download visa pack
                  </a>
                </Button>
              </>
            ) : null}
            {canInvoice ? (
              <Button asChild variant="outline" className="min-h-11 md:min-h-8">
                <Link href={`/admin/commercial/worker-invoices/new?cv=${s.id}`} data-testid="worker-invoice-link">
                  <ReceiptText aria-hidden="true" />
                  Create invoice for this worker
                </Link>
              </Button>
            ) : null}
            {canAskReview ? (
              <Button asChild variant="outline" className="min-h-11 md:min-h-8">
                <Link href={`/admin/reviews?ask=${s.id}`} data-testid="ask-review-link">
                  <Star aria-hidden="true" />
                  Ask for a review
                </Link>
              </Button>
            ) : null}
          </div>
        }
      />
      {canOpenDocuments && wordCv ? (
        <p className="rounded-lg border border-border bg-surface-subtle p-3 text-sm text-foreground">
          The CV is a Word file, which cannot be merged into the PDF packs (they include a note page instead). Download the Word CV separately and attach it next to the pack.
        </p>
      ) : null}
      {s.referralCode ? (
        <p className="rounded-lg border border-teal/30 bg-teal-soft p-3 text-sm text-foreground" data-testid="referral-code">
          Referred with code <strong className="font-mono font-semibold">{s.referralCode}</strong>
        </p>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,0.7fr)]">
        <SectionCard title="Details">
          <KeyValueList
            items={[
              { label: "Mobile / WhatsApp", value: s.phone ?? `${s.phoneMasked} (needs the contact details permission)` },
              {
                label: "Email",
                value: s.email ? (
                  <a href={`mailto:${s.email}`} className="break-all underline underline-offset-4">
                    {s.email}
                  </a>
                ) : s.emailMasked ? (
                  `${s.emailMasked} (needs the contact details permission)`
                ) : (
                  "Not given"
                ),
              },
              { label: "Trade", value: s.tradeOther ? `${s.tradeLabel} (typed by the candidate)` : s.tradeLabel },
              { label: "Experience abroad", value: yearsText(s.experienceAbroadYears) },
              { label: "Experience in India", value: yearsText(s.experienceIndiaYears) },
              ...(!splitGiven && s.experienceYears !== null ? [{ label: "Experience (total)", value: yearsText(s.experienceYears) }] : []),
              { label: "Passport", value: passport },
              {
                label: "Passport expiry",
                value: s.passportExpiry ? (
                  <span className="inline-flex flex-wrap items-center gap-2">
                    <DateText value={s.passportExpiry} />
                    {s.passportExpiringSoon ? (
                      <StatusBadge tone="warning" size="sm">
                        Expiring soon
                      </StatusBadge>
                    ) : null}
                  </span>
                ) : (
                  "Not given"
                ),
              },
              { label: "Preferred country", value: s.countryName ?? "Any" },
              {
                label: "Applied for",
                value: s.requirementTitle ? (
                  <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
                    {s.requirementSlug ? (
                      <Link href={`/requirements/${s.requirementSlug}`} target="_blank" className="underline underline-offset-4">
                        {s.requirementTitle}
                      </Link>
                    ) : (
                      s.requirementTitle
                    )}
                    {s.requirementEntryId && canSeePosters ? (
                      <Link href={`/admin/requirements/posters/${s.requirementEntryId}/applicants`} className="text-sm text-navy underline underline-offset-4">
                        All applicants
                      </Link>
                    ) : null}
                  </span>
                ) : (
                  "General (no requirement)"
                ),
              },
              { label: "Notes for us (from the candidate)", value: s.candidateNotes ? <span className="whitespace-pre-line">{s.candidateNotes}</span> : "None" },
              { label: "Applied on", value: <DateText value={s.createdAt} mode="datetime" /> },
              { label: "Came from", value: CV_SUBMISSION_SOURCE_LABELS[s.source] },
              ...(s.placedOrganizationName ? [{ label: "Supplied to", value: s.placedOrganizationName }] : []),
              { label: "First contacted", value: s.contactedAt ? <DateText value={s.contactedAt} mode="datetime" /> : "Not yet" },
              { label: "CV", value: cvValue },
            ]}
          />
        </SectionCard>
        <div className="space-y-6">
          <SectionCard title="Placement stage" description="The stage and the note for the candidate are shown on the public status page (mobile number + reference).">
            {canManage ? (
              <ActionForm
                action={setCvSubmissionStatusAction}
                hidden={{ id: s.id }}
                submitLabel="Save stage"
                fields={[
                  { name: "status", label: "Stage", kind: "select", required: true, options: statusOptions, defaultValue: s.status },
                  {
                    name: "candidateNote",
                    label: "Note for the candidate",
                    kind: "textarea",
                    optional: true,
                    rows: 3,
                    defaultValue: s.candidateNote ?? "",
                    placeholder: "Trade test on 5 December at our office. Bring your original certificates.",
                    hint: "The candidate sees this note. Do not write anything private; use the staff remarks for that.",
                  },
                ]}
              />
            ) : s.candidateNote ? (
              <p className="whitespace-pre-line text-sm text-foreground">{s.candidateNote}</p>
            ) : null}
            <ol className="mt-4 space-y-2 border-t border-border pt-4 text-sm" aria-label="Stage history" data-testid="stage-history">
              {[...s.stageHistory].reverse().map((e, i) => (
                <li key={`${e.at.toISOString()}-${i}`} className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-medium text-foreground">{CV_SUBMISSION_STATUS_LABELS[e.status]}</span>
                  <span className="text-muted-foreground">
                    <DateText value={e.at} mode="datetime" />
                    {e.byName ? ` · ${e.byName}` : ""}
                  </span>
                </li>
              ))}
            </ol>
          </SectionCard>
          <SectionCard title="Remarks (staff only)" description="Never shown to the candidate. Changes are recorded in the audit log.">
            {canManage ? (
              <ActionForm
                action={setCvSubmissionRemarksAction}
                hidden={{ id: s.id }}
                submitLabel="Save remarks"
                fields={[{ name: "remarks", label: "Remarks", kind: "textarea", optional: true, rows: 5, defaultValue: s.staffRemarks ?? "", placeholder: "Called on Monday, has passport, good TIG welder" }]}
              />
            ) : (
              <p className="whitespace-pre-line text-sm text-foreground">{s.staffRemarks ?? "No remarks yet."}</p>
            )}
            {s.remarksUpdatedAt ? (
              <p className="mt-3 text-xs text-muted-foreground">
                Last changed <DateText value={s.remarksUpdatedAt} mode="datetime" />
                {s.remarksUpdatedByName ? ` by ${s.remarksUpdatedByName}` : ""}
              </p>
            ) : null}
          </SectionCard>
        </div>
      </div>
      <DocumentsCard submissionId={s.id} code={s.code} name={s.name} phone={s.phone} documents={documents} canManage={canManage} />
    </div>
  );
}
