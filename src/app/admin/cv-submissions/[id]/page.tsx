import { Download, Eye, FileStack, MessageCircle, Phone, Stamp } from "lucide-react";
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
import { whatsappHref } from "@/config/contact";
import { sp as pick, type SearchParams } from "@/lib/http";
import { requireStaff, staffCan } from "@/modules/identity/authz";
import { CV_SUBMISSION_STATUS_LABELS, CV_SUBMISSION_STATUS_TONE, CV_SUBMISSION_STATUS_VALUES } from "@/modules/operations/cv-submission-schemas";
import { listCvSubmissionDocuments } from "@/modules/operations/cv-submission-documents";
import { getCvSubmission } from "@/modules/operations/cv-submissions";

import { setCvSubmissionRemarksAction, setCvSubmissionStatusAction } from "../actions";
import { DocumentsCard } from "./_components/documents-card";

export const metadata: Metadata = { title: "CV submission" };

const statusOptions = CV_SUBMISSION_STATUS_VALUES.map((value) => ({ value, label: CV_SUBMISSION_STATUS_LABELS[value] }));

export default async function CvSubmissionPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> }) {
  const ctx = await requireStaff("candidates.view");
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const s = await getCvSubmission(ctx, id, { revealPassport: pick(sp, "reveal") === "passport" });
  if (!s) notFound();
  const canManage = staffCan(ctx, "candidates.manage");
  const canOpenDocuments = staffCan(ctx, ["candidates.view_documents", "recruitment.manage"], "any");
  const documents = await listCvSubmissionDocuments(ctx, s.id);
  const wordCv = s.cvMimeType === "application/msword" || s.cvMimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

  const passport = s.passportNumber ? (
    <span className="font-mono font-semibold" data-testid="passport-full">
      {s.passportNumber}
    </span>
  ) : s.passportLast4 ? (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span className="font-mono">…{s.passportLast4}</span>
      {s.canRevealPassport ? (
        <Button asChild variant="outline" size="sm">
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

  return (
    <div className="space-y-6">
      <PageHeader
        title={s.name}
        eyebrow={s.code}
        backLink={{ href: "/admin/cv-submissions", label: "CV submissions" }}
        status={<StatusBadge tone={CV_SUBMISSION_STATUS_TONE[s.status]}>{CV_SUBMISSION_STATUS_LABELS[s.status]}</StatusBadge>}
        actions={
          <div className="flex flex-wrap gap-2">
            {canOpenDocuments ? (
              <>
                <Button asChild variant="outline">
                  <a href={`/admin/cv-submissions/${s.id}/pack?type=cv`} data-testid="cv-pack-download">
                    <FileStack aria-hidden="true" />
                    Download CV pack
                  </a>
                </Button>
                <Button asChild variant="outline">
                  <a href={`/admin/cv-submissions/${s.id}/pack?type=visa`} data-testid="visa-pack-download">
                    <Stamp aria-hidden="true" />
                    Download visa pack
                  </a>
                </Button>
              </>
            ) : null}
            {s.phone ? (
              <>
                <Button asChild>
                  <a href={whatsappHref(`Hello ${s.name}, this is Venkat Sai Global about the CV you sent for ${s.tradeLabel}.`, s.phone)} target="_blank" rel="noopener noreferrer">
                    <MessageCircle aria-hidden="true" />
                    WhatsApp
                  </a>
                </Button>
                <Button asChild variant="outline">
                  <a href={`tel:${s.phone}`}>
                    <Phone aria-hidden="true" />
                    Call
                  </a>
                </Button>
              </>
            ) : null}
          </div>
        }
      />
      {canOpenDocuments && wordCv ? (
        <p className="rounded-lg border border-border bg-surface-subtle p-3 text-sm text-foreground">
          The CV is a Word file, which cannot be merged into the PDF packs (they include a note page instead). Download the Word CV separately and attach it next to the pack.
        </p>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,0.7fr)]">
        <SectionCard title="Details">
          <KeyValueList
            items={[
              { label: "Mobile / WhatsApp", value: s.phone ?? `${s.phoneMasked} (needs the contact details permission)` },
              { label: "Trade", value: s.tradeOther ? `${s.tradeLabel} (typed by the candidate)` : s.tradeLabel },
              { label: "Experience", value: s.experienceYears !== null ? `${s.experienceYears} years` : "Not given" },
              { label: "Preferred country", value: s.countryName ?? "Any" },
              { label: "Passport", value: passport },
              {
                label: "Requirement",
                value: s.requirementTitle ? (
                  s.requirementSlug ? (
                    <Link href={`/requirements/${s.requirementSlug}`} target="_blank" className="underline underline-offset-4">
                      {s.requirementTitle}
                    </Link>
                  ) : (
                    s.requirementTitle
                  )
                ) : (
                  "General CV"
                ),
              },
              { label: "Notes for us (from the candidate)", value: s.candidateNotes ? <span className="whitespace-pre-line">{s.candidateNotes}</span> : "None" },
              { label: "Received", value: <DateText value={s.createdAt} mode="datetime" /> },
              { label: "First contacted", value: s.contactedAt ? <DateText value={s.contactedAt} mode="datetime" /> : "Not yet" },
              {
                label: "CV",
                value: s.cvUrl ? (
                  <Button asChild variant="outline" size="sm">
                    <a href={s.cvUrl} data-testid="cv-download">
                      <Download aria-hidden="true" />
                      Download {s.cvName ?? "CV"}
                    </a>
                  </Button>
                ) : s.cvBlocked ? (
                  "Waiting for the security scan"
                ) : (
                  "You do not have access to CVs"
                ),
              },
            ]}
          />
        </SectionCard>
        <div className="space-y-6">
          {canManage ? (
            <SectionCard title="Status">
              <ActionForm action={setCvSubmissionStatusAction} hidden={{ id: s.id }} submitLabel="Save status" fields={[{ name: "status", label: "Status", kind: "select", required: true, options: statusOptions, defaultValue: s.status }]} />
            </SectionCard>
          ) : null}
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
