import { Download, MessageCircle, Phone, RefreshCw } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ActionButton } from "@/components/admin/action-button";
import { ActionForm } from "@/components/admin/action-form";
import { CopyLinkButton } from "@/components/admin/copy-link-button";
import { ResumeForm } from "@/components/resume/resume-form";
import { DateText } from "@/components/shared/date-text";
import { KeyValueList } from "@/components/shared/key-value-list";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { whatsappHref } from "@/config/contact";
import { requireStaff } from "@/modules/identity/authz";
import { experienceMonths, formatDateDots, formatExperienceTotal, periodTo } from "@/modules/resume-service/experience";
import { RESUME_REQUEST_STATUS_LABELS, RESUME_REQUEST_STATUS_TONE, type ExperienceRow } from "@/modules/resume-service/schemas";
import { getResumeRequest } from "@/modules/resume-service/service";

import { issueResumeLinkAction, regenerateResumeAction, setResumeNotesAction, setResumeStatusAction, updateResumeDetailsAction } from "../actions";

export const metadata: Metadata = { title: "Resume request" };

function ExperienceList({ rows, style }: { rows: ExperienceRow[]; style: "title" | "upper" }) {
  if (!rows.length) return <span className="text-muted-foreground">None</span>;
  return (
    <div className="space-y-1">
      <p className="font-medium">{formatExperienceTotal(experienceMonths(rows, new Date()), style) || "Less than a month"}</p>
      <ol className="list-decimal space-y-1 pl-5">
        {rows.map((r, i) => (
          <li key={i}>
            {r.designation}, {r.organisation}
            {r.location ? ` (${r.location})` : ""}: {formatDateDots(r.from)} to {periodTo(r)}
          </li>
        ))}
      </ol>
    </div>
  );
}

/** One resume request (candidates.manage; the read is logged): payment, generation, delivery link, details, notes. */
export default async function ResumeRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireStaff("candidates.manage");
  const { id } = await params;
  const r = await getResumeRequest(ctx, id);
  if (!r) notFound();
  const d = r.details;
  const awaiting = r.status === "awaiting_payment" || r.status === "submitted";
  const ready = r.status === "generated" || r.status === "delivered";

  return (
    <div className="space-y-6">
      <PageHeader
        title={r.name}
        eyebrow={r.code}
        backLink={{ href: "/admin/resume-requests", label: "Resume requests" }}
        status={<StatusBadge tone={RESUME_REQUEST_STATUS_TONE[r.status]}>{RESUME_REQUEST_STATUS_LABELS[r.status]}</StatusBadge>}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <a href={whatsappHref(`Hello ${r.name}, this is Venkat Sai Global about your resume request ${r.code}.`, r.phone)} target="_blank" rel="noopener noreferrer">
                <MessageCircle aria-hidden="true" />
                WhatsApp
              </a>
            </Button>
            <Button asChild variant="outline">
              <a href={`tel:${r.phone}`}>
                <Phone aria-hidden="true" />
                Call
              </a>
            </Button>
          </div>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,0.7fr)]">
        <SectionCard title="Details" description="As the candidate sent them (or as corrected by staff). Printed on the resume in this order.">
          {d ? (
            <div className="space-y-4">
              {r.photo?.thumbnailUrl ? <Image src={r.photo.thumbnailUrl} alt={`Photo of ${r.name}`} width={96} height={124} unoptimized className="h-31 w-24 rounded-md border border-border object-cover" /> : null}
              <KeyValueList
                items={[
                  { label: "Post applied for", value: d.postAppliedFor },
                  { label: "Name", value: d.name },
                  { label: "Father name", value: d.fatherName ?? "Not given" },
                  { label: "Date of birth", value: d.dateOfBirth ? formatDateDots(d.dateOfBirth) : "Not given" },
                  { label: "Marital status", value: d.maritalStatus ?? "Not given" },
                  { label: "Education qualification", value: d.educationQualification ?? "Not given" },
                  { label: "Technical qualification", value: d.technicalQualification ?? "Not given" },
                  { label: "Nationality", value: d.nationality ?? "Not given" },
                  { label: "Religion", value: d.religion ?? "Left off the resume" },
                  { label: "Languages", value: d.languages ?? "Not given" },
                  { label: "Permanent address", value: d.permanentAddress ? <span className="whitespace-pre-line">{d.permanentAddress}</span> : "Not given" },
                  { label: "Contact", value: [d.contactPhone, d.alternatePhone].filter(Boolean).join(" / ") },
                  { label: "Email", value: d.email ?? "Not given" },
                  { label: "Passport", value: [d.passport.number, d.passport.dateOfIssue ? `issued ${formatDateDots(d.passport.dateOfIssue)}` : null, d.passport.dateOfExpiry ? `expires ${formatDateDots(d.passport.dateOfExpiry)}` : null, d.passport.placeOfIssue].filter(Boolean).join(", ") || "Not given" },
                  { label: "Experience abroad", value: <ExperienceList rows={d.abroadExperience} style="title" /> },
                  { label: "Experience in India", value: <ExperienceList rows={d.indiaExperience} style="upper" /> },
                  { label: "Declaration", value: d.declaration.include ? `Included${d.declaration.place ? ` (place: ${d.declaration.place})` : ""}` : "Left out" },
                  { label: "Notes from the candidate", value: r.candidateNotes ? <span className="whitespace-pre-line">{r.candidateNotes}</span> : "None" },
                  { label: "Received", value: <DateText value={r.createdAt} mode="datetime" /> },
                  ...(r.cvSubmissionId ? [{ label: "CV submission", value: <Link href={`/admin/cv-submissions/${r.cvSubmissionId}`} className="underline underline-offset-4">Open the CV this candidate sent</Link> }] : []),
                ]}
              />
            </div>
          ) : (
            <p className="text-sm text-danger-strong">The saved details are incomplete. Correct them below and save.</p>
          )}
        </SectionCard>
        <div className="space-y-6">
          <SectionCard title="Payment and resume">
            <KeyValueList
              items={[
                { label: "Price", value: r.priceLabel },
                { label: "Payment", value: r.paidAt ? `${r.paymentMethod === "waived" ? "Fee waived" : "Paid"} ${r.paymentReference ? `(ref. ${r.paymentReference})` : ""}`.trim() : "Not paid yet" },
                ...(r.paidAt ? [{ label: "Recorded", value: <>{<DateText value={r.paidAt} mode="datetime" />}{r.paymentRecordedByName ? ` by ${r.paymentRecordedByName}` : ""}</> }] : []),
                { label: "Generated", value: r.generatedAt ? <DateText value={r.generatedAt} mode="datetime" /> : "Not yet" },
                { label: "Delivered", value: r.deliveredAt ? <DateText value={r.deliveredAt} mode="datetime" /> : "Not yet" },
              ]}
            />
            <div className="mt-5 space-y-5">
              {awaiting ? (
                <>
                  <ActionForm
                    action={setResumeStatusAction}
                    hidden={{ id: r.id, status: "paid" }}
                    submitLabel="Record payment and generate"
                    intro={<p className="text-sm text-muted-foreground">After you collect the payment (UPI, bank transfer or cash), record it here. The resume is generated straight away.</p>}
                    fields={[{ name: "paymentReference", label: "Payment reference", optional: true, placeholder: "UPI or bank reference" }]}
                    testId="record-payment"
                  />
                  <div className="flex flex-wrap gap-2">
                    <ActionForm action={setResumeStatusAction} hidden={{ id: r.id, status: "waived" }} submitLabel="Waive the fee and generate" submitVariant="outline" />
                    <ActionForm action={setResumeStatusAction} hidden={{ id: r.id, status: "cancelled" }} submitLabel="Cancel request" submitVariant="outline" />
                  </div>
                </>
              ) : null}
              {r.status === "paid" || r.status === "waived" ? (
                <ActionButton action={regenerateResumeAction.bind(null, { id: r.id })} variant="default" icon={<RefreshCw aria-hidden="true" />}>
                  Generate resume
                </ActionButton>
              ) : null}
              {ready ? (
                <div className="space-y-4">
                  <div className="flex flex-wrap gap-2">
                    {r.pdf ? (
                      <Button asChild variant="outline" size="sm">
                        <a href={r.pdf.url} data-testid="generated-pdf">
                          <Download aria-hidden="true" />
                          PDF
                        </a>
                      </Button>
                    ) : null}
                    {r.docx ? (
                      <Button asChild variant="outline" size="sm">
                        <a href={r.docx.url} data-testid="generated-docx">
                          <Download aria-hidden="true" />
                          Word
                        </a>
                      </Button>
                    ) : null}
                    <ActionButton action={regenerateResumeAction.bind(null, { id: r.id })} icon={<RefreshCw aria-hidden="true" />}>
                      Generate again
                    </ActionButton>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">Candidate download link</h3>
                    <p className="mb-2 text-sm text-muted-foreground">Private link to the Word and PDF files, valid for 30 days. Cancelling the request switches every link off.</p>
                    <CopyLinkButton
                      action={issueResumeLinkAction.bind(null, { id: r.id })}
                      label="Copy download link"
                      whatsappPhone={r.phone}
                      whatsappMessage={`Hello ${r.name}, your resume is ready. Download it (Word and PDF) here:`}
                      testId="copy-resume-link"
                    />
                  </div>
                  {r.status === "generated" ? <ActionForm action={setResumeStatusAction} hidden={{ id: r.id, status: "delivered" }} submitLabel="Mark delivered" submitVariant="outline" /> : null}
                </div>
              ) : null}
              {r.status === "cancelled" ? <ActionForm action={setResumeStatusAction} hidden={{ id: r.id, status: "awaiting_payment" }} submitLabel="Reopen request" submitVariant="outline" /> : null}
            </div>
          </SectionCard>
          <SectionCard title="Staff notes" description="Never shown to the candidate. Changes are recorded in the audit log.">
            <ActionForm action={setResumeNotesAction} hidden={{ id: r.id }} submitLabel="Save notes" fields={[{ name: "notes", label: "Notes", kind: "textarea", optional: true, rows: 4, defaultValue: r.staffNotes ?? "" }]} />
          </SectionCard>
        </div>
      </div>
      {r.status !== "cancelled" ? (
        <details className="rounded-2xl border border-border bg-card p-4 sm:p-6">
          <summary className="cursor-pointer font-heading text-lg font-semibold text-navy">Correct the details</summary>
          <p className="mt-2 text-sm text-muted-foreground">Fix spelling, dates or experience rows, save, then generate the resume again.</p>
          <div className="mt-4">
            <ResumeForm mode="staff" initial={d} requestId={r.id} staffAction={updateResumeDetailsAction} />
          </div>
        </details>
      ) : null}
    </div>
  );
}
