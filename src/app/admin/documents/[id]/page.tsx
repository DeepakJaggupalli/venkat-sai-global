import { Check, Download, Mail, MessageCircle, RotateCcw } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ActionButton } from "@/components/admin/action-button";
import { ActionForm } from "@/components/admin/action-form";
import { CopyButton } from "@/components/shared/copy-button";
import { DateText } from "@/components/shared/date-text";
import { KeyValueList } from "@/components/shared/key-value-list";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { absoluteUrl } from "@/lib/env";
import { DOCUMENT_KIND_LABELS, DOCUMENT_ORIGIN_LABELS, DOCUMENT_STATUS_LABELS, DOCUMENT_STATUS_TONE, DOCUMENTS_ADMIN_PATH, firstName, INTERNSHIPS_ADMIN_PATH, isCertificateKind } from "@/modules/documents/content";
import { documentPdfPath, documentVerifyPath, getDocumentForStaff } from "@/modules/documents/service";
import { requireStaff } from "@/modules/identity/authz";
import { formatVerificationCode } from "@/modules/training/rules";

import { approveDocumentsAction, rejectDocumentAction, reopenDocumentAction, revokeDocumentAction, saveDocumentAction } from "../actions";

export const metadata: Metadata = { title: "Certificate or letter" };

function waLink(message: string, phone: string | null): string {
  const n = phone?.replace(/[^\d]/g, "");
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(message)}` : `https://wa.me/?text=${encodeURIComponent(message)}`;
}

/** One document: live PDF preview, every printed line editable, approve / reject / revoke, and send it. */
export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireStaff("training.certificates");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const d = await getDocumentForStaff(ctx, id);
  if (!d) notFound();
  const c = d.parsed;
  const approved = d.status === "approved";
  const pdfUrl = absoluteUrl(documentPdfPath(d.verificationCode));
  const checkUrl = absoluteUrl(documentVerifyPath(d.verificationCode));
  const kindLabel = DOCUMENT_KIND_LABELS[d.kind].replace(" (LOR)", "");
  const message = `Hello ${firstName(c.holderName)}, your ${kindLabel.toLowerCase()} from ${c.organisation} is ready. Download it here: ${pdfUrl}`;
  const editable = d.status === "pending" || d.status === "approved";

  return (
    <div className="space-y-6">
      <PageHeader
        title={c.holderName}
        eyebrow={`${DOCUMENT_KIND_LABELS[d.kind]} · ${d.code}`}
        backLink={{ href: `${DOCUMENTS_ADMIN_PATH}?status=${d.status}`, label: "Certificates and letters" }}
        status={<StatusBadge tone={DOCUMENT_STATUS_TONE[d.status]}>{DOCUMENT_STATUS_LABELS[d.status]}</StatusBadge>}
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,0.75fr)]">
        <SectionCard
          title="Preview"
          description={approved ? "This is exactly what the person downloads." : "A “DRAFT” mark is shown until you approve. It disappears on the approved copy."}
          action={{ label: "Open full size", href: `${DOCUMENTS_ADMIN_PATH}/${d.id}/pdf` }}
        >
          <iframe
            key={d.updatedAt.getTime()}
            title={`Preview of ${kindLabel} for ${c.holderName}`}
            src={`${DOCUMENTS_ADMIN_PATH}/${d.id}/pdf?v=${d.updatedAt.getTime()}`}
            className={`w-full rounded-lg border border-border bg-white ${isCertificateKind(d.kind) ? "aspect-[1.414]" : "aspect-[0.75] max-h-[56rem]"}`}
            data-testid="document-preview"
          />
        </SectionCard>

        <div className="space-y-6">
          {d.status === "pending" ? (
            <SectionCard title="Approve" description="Read the preview first. After approval the person can download it and anyone can check it with the QR code.">
              <div className="space-y-4">
                <ActionButton action={approveDocumentsAction.bind(null, { ids: [d.id] })} variant="default" size="default" icon={<Check aria-hidden="true" />} testId="approve-document">
                  Approve
                </ActionButton>
                <ActionForm action={rejectDocumentAction} hidden={{ id: d.id }} submitLabel="Reject" submitVariant="outline" fields={[{ name: "reason", label: "Reason (the person sees it)", kind: "textarea", rows: 2, placeholder: "e.g. The internship is not finished yet" }]} />
              </div>
            </SectionCard>
          ) : null}

          {approved ? (
            <SectionCard title="Send or download" description="The link opens the PDF. It stays valid unless you revoke the document.">
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  <Button asChild>
                    <a href={waLink(message, d.holderPhone)} target="_blank" rel="noopener noreferrer" data-testid="share-whatsapp">
                      <MessageCircle aria-hidden="true" />
                      WhatsApp{d.holderPhone ? "" : " (choose contact)"}
                    </a>
                  </Button>
                  <Button asChild variant="outline">
                    <a href={`mailto:${d.holderEmail ?? ""}?subject=${encodeURIComponent(`${c.title} - ${c.holderName}`)}&body=${encodeURIComponent(`${message}\n\nAnyone can check it here: ${checkUrl}`)}`} data-testid="share-email">
                      <Mail aria-hidden="true" />
                      Email
                    </a>
                  </Button>
                  <Button asChild variant="outline">
                    <a href={`${DOCUMENTS_ADMIN_PATH}/${d.id}/pdf?download=1`} data-testid="download-pdf">
                      <Download aria-hidden="true" />
                      Download PDF
                    </a>
                  </Button>
                </div>
                <div className="flex items-center gap-2 rounded-lg bg-surface-subtle p-3 text-sm">
                  <span className="min-w-0 flex-1 truncate font-mono text-xs" title={pdfUrl}>
                    {pdfUrl}
                  </span>
                  <CopyButton value={pdfUrl} label="download link" showLabel size="sm" variant="outline" />
                </div>
                <details className="text-sm">
                  <summary className="cursor-pointer font-medium text-muted-foreground">Revoke (if it was given by mistake)</summary>
                  <div className="mt-3">
                    <ActionForm action={revokeDocumentAction} hidden={{ id: d.id }} submitLabel="Revoke" submitVariant="destructive" fields={[{ name: "reason", label: "Reason", kind: "textarea", rows: 2 }]} />
                  </div>
                </details>
              </div>
            </SectionCard>
          ) : null}

          {d.status === "rejected" ? (
            <SectionCard title="Rejected" description={d.rejectedReason ?? undefined}>
              <ActionButton action={reopenDocumentAction.bind(null, { id: d.id })} icon={<RotateCcw aria-hidden="true" />}>
                Reopen for approval
              </ActionButton>
            </SectionCard>
          ) : null}
          {d.status === "revoked" ? <SectionCard title="Revoked" description={d.revokedReason ?? undefined}>The check page shows this document as revoked. Make a new one if needed.</SectionCard> : null}

          <SectionCard title="About">
            <KeyValueList
              items={[
                { label: "Type", value: DOCUMENT_KIND_LABELS[d.kind] },
                { label: "How it was made", value: DOCUMENT_ORIGIN_LABELS[d.origin] },
                ...(d.requestNote ? [{ label: "Their note", value: <span className="whitespace-pre-line">{d.requestNote}</span> }] : []),
                { label: "WhatsApp", value: d.holderPhone ?? "Not given" },
                { label: "Email", value: d.holderEmail ?? "Not given" },
                { label: "Account", value: d.candidateUserId ? "Has a People account (sees it in “Certificates”)" : "No account: send the link" },
                ...(d.intern ? [{ label: "Internship", value: <Link href={`${INTERNSHIPS_ADMIN_PATH}/${d.intern.programmeId}`} className="underline underline-offset-4">{d.intern.programmeTitle}</Link> }] : []),
                { label: "Verification code", value: <span className="font-mono">{formatVerificationCode(d.verificationCode)}</span> },
                { label: "Created", value: <DateText value={d.createdAt} mode="datetime" /> },
                ...(d.approvedAt ? [{ label: "Approved", value: <DateText value={d.approvedAt} mode="datetime" /> }] : []),
              ]}
            />
          </SectionCard>
        </div>
      </div>

      {editable ? (
        <SectionCard title="Edit the wording" description="Change any line, save, and the preview updates. Type names in English letters so they print correctly. Separate paragraphs with an empty line.">
          <ActionForm
            action={saveDocumentAction}
            hidden={{ id: d.id }}
            submitLabel="Save changes"
            columns={2}
            testId="edit-document-form"
            fields={[
              { name: "title", label: "Heading", defaultValue: c.title },
              { name: "holderName", label: "Name (as printed)", defaultValue: c.holderName },
              { name: "programme", label: "Course or internship", defaultValue: c.programme },
              { name: "role", label: "Role or track", optional: true, defaultValue: c.role ?? "" },
              { name: "organisation", label: "Organisation", defaultValue: c.organisation, wide: true },
              { name: "startDate", label: "Start date", kind: "date", optional: true, defaultValue: c.startDate ?? "" },
              { name: "endDate", label: "End date", kind: "date", optional: true, defaultValue: c.endDate ?? "" },
              { name: "duration", label: "Duration", optional: true, defaultValue: c.duration ?? "", placeholder: "e.g. 8 weeks" },
              { name: "result", label: "Result or grade", optional: true, defaultValue: c.result ?? "", placeholder: "e.g. Passed (82%)" },
              { name: "body", label: isCertificateKind(d.kind) ? "Text under the name" : "Letter text", kind: "textarea", rows: isCertificateKind(d.kind) ? 4 : 12, defaultValue: c.body, wide: true },
              { name: "signatoryName", label: "Signed by", optional: true, defaultValue: c.signatoryName ?? "" },
              { name: "signatoryTitle", label: "Signatory title", defaultValue: c.signatoryTitle },
              { name: "place", label: "Place", defaultValue: c.place },
              { name: "issueDate", label: "Date printed", kind: "date", optional: true, defaultValue: c.issueDate ?? "", hint: "Empty = the approval date." },
              { name: "holderPhone", label: "WhatsApp number (for sending)", kind: "tel", optional: true, defaultValue: d.holderPhone ?? "" },
              { name: "holderEmail", label: "Email (for sending)", kind: "email", optional: true, defaultValue: d.holderEmail ?? "" },
            ]}
          />
        </SectionCard>
      ) : null}
    </div>
  );
}
