import { ArrowDown, ArrowUp, FileText, Trash2 } from "lucide-react";
import Image from "next/image";

import { ActionButton } from "@/components/admin/action-button";
import { CopyLinkButton } from "@/components/admin/copy-link-button";
import { DocumentUploader } from "@/components/documents/document-uploader";
import { SectionCard } from "@/components/shared/section-card";
import { formatFileSize } from "@/lib/format";
import type { CvSubmissionDocumentItem } from "@/modules/operations/cv-submission-documents";
import {
  CV_DOCUMENT_ACCEPT,
  CV_DOCUMENT_KIND_HINTS,
  CV_DOCUMENT_KIND_LABELS,
  CV_DOCUMENT_KIND_VALUES,
  CV_DOCUMENT_MAX_BYTES,
  CV_DOCUMENT_SINGLE_KINDS,
  CV_DOCUMENT_TYPES_LABEL,
} from "@/modules/operations/cv-submission-schemas";

import { deleteCvDocumentAction, issueCvUploadLinkAction, moveCvDocumentAction } from "../../actions";

const kinds = CV_DOCUMENT_KIND_VALUES.map((value) => ({ value, label: CV_DOCUMENT_KIND_LABELS[value], hint: CV_DOCUMENT_KIND_HINTS[value] }));

/** Documents attached to a CV submission: thumbnails, order within each kind, delete, staff upload and the candidate link. */
export function DocumentsCard({
  submissionId,
  code,
  name,
  phone,
  documents,
  canManage,
}: {
  submissionId: string;
  code: string;
  name: string;
  phone: string | null;
  documents: CvSubmissionDocumentItem[];
  canManage: boolean;
}) {
  return (
    <SectionCard title="Documents" description="Certificates, licences, passport pages and photo. Added by the candidate through their upload link or by staff, one file at a time.">
      {documents.length ? (
        <ul className="divide-y divide-border" data-testid="cv-documents">
          {documents.map((d) => {
            const siblings = documents.filter((x) => x.kind === d.kind);
            const index = siblings.indexOf(d);
            const reorderable = canManage && !CV_DOCUMENT_SINGLE_KINDS.includes(d.kind) && siblings.length > 1;
            return (
              <li key={d.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-surface-subtle">
                  {d.thumbnailUrl ? <Image src={d.thumbnailUrl} alt="" width={64} height={64} unoptimized className="size-full object-cover" /> : <FileText className="size-6 text-muted-foreground" aria-hidden="true" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">
                    {d.kindLabel}
                    {siblings.length > 1 ? <span className="text-muted-foreground"> ({index + 1} of {siblings.length})</span> : null}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {d.url ? (
                      <a href={d.url} target="_blank" rel="noopener" className="underline underline-offset-4">
                        {d.fileName}
                      </a>
                    ) : (
                      d.fileName
                    )}{" "}
                    · {formatFileSize(d.sizeBytes)} · {d.uploadedByStaff ? "added by staff" : "sent by the candidate"}
                    {d.blocked ? " · waiting for the security scan" : ""}
                  </p>
                </div>
                {canManage ? (
                  <div className="flex flex-wrap gap-1">
                    {reorderable ? (
                      <>
                        {index > 0 ? (
                          <ActionButton action={moveCvDocumentAction.bind(null, { id: d.id, direction: "up" })} variant="ghost" icon={<ArrowUp aria-hidden="true" />}>
                            <span className="sr-only">Move {d.kindLabel} up</span>
                          </ActionButton>
                        ) : null}
                        {index < siblings.length - 1 ? (
                          <ActionButton action={moveCvDocumentAction.bind(null, { id: d.id, direction: "down" })} variant="ghost" icon={<ArrowDown aria-hidden="true" />}>
                            <span className="sr-only">Move {d.kindLabel} down</span>
                          </ActionButton>
                        ) : null}
                      </>
                    ) : null}
                    <ActionButton
                      action={deleteCvDocumentAction.bind(null, { id: d.id })}
                      variant="ghost"
                      icon={<Trash2 aria-hidden="true" />}
                      confirm={{ title: `Remove this ${d.kindLabel.toLowerCase()}?`, description: "The file stops being available at once. This is recorded in the audit log.", confirmLabel: "Remove", destructive: true }}
                    >
                      <span className="sr-only">Remove {d.kindLabel}</span>
                    </ActionButton>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No documents yet. Send the candidate an upload link, or add them here.</p>
      )}
      {canManage ? (
        <div className="mt-6 space-y-6 border-t border-border pt-6">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Candidate upload link</h3>
            <p className="mb-2 text-sm text-muted-foreground">A fresh link valid for 7 days. The candidate can only add documents with it; nothing stored is shown.</p>
            <CopyLinkButton
              action={issueCvUploadLinkAction.bind(null, { id: submissionId })}
              label="Copy upload link"
              whatsappPhone={phone}
              whatsappMessage={`Hello ${name}, please add your certificates, passport pages and photo for CV ${code} here, one file at a time:`}
              testId="copy-upload-link"
            />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Add a document for the candidate</h3>
            <DocumentUploader
              className="mt-2"
              endpoint={`/admin/cv-submissions/${submissionId}/documents`}
              kinds={kinds}
              maxBytes={CV_DOCUMENT_MAX_BYTES}
              accept={CV_DOCUMENT_ACCEPT}
              typesLabel={CV_DOCUMENT_TYPES_LABEL}
              refreshOnUpload
            />
          </div>
        </div>
      ) : null}
    </SectionCard>
  );
}
