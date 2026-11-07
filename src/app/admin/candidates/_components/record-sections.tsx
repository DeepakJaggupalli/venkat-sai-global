import { CheckCircle2 } from "lucide-react";

import { ActionButton } from "@/components/admin/action-button";
import { DateText } from "@/components/shared/date-text";
import { EmptyState } from "@/components/shared/empty-state";
import { SectionCard } from "@/components/shared/section-card";
import { VerificationBadge } from "@/components/shared/verification-badge";
import { verifyEducationAction, verifyExperienceAction } from "@/modules/candidates/actions";
import type { CandidateView } from "@/modules/candidates/types";

import { ReasonDialog } from "../../pipeline/_shared/reason-dialog";
import { humanize } from "../../pipeline/_shared/status";
import { decideItemFormAction, openDocumentAction, verifyEntryFormAction } from "../actions";
import { OpenDocumentButton } from "./sensitive";

const DECISIONS = [
  { value: "approved", label: "Verified" },
  { value: "changes_requested", label: "Needs changes" },
  { value: "rejected", label: "Rejected" },
];

function dateRange(start: string | null, end: string | null, current: boolean) {
  if (!start && !end) return null;
  return (
    <>
      {start ? <DateText value={start} dateOnly /> : "—"} – {current ? "present" : end ? <DateText value={end} dateOnly /> : "—"}
    </>
  );
}

type Perms = { canVerify: boolean; canOpen: boolean };

/** Work experience with staff validation (verify / reject with a reason the candidate sees). */
export function ExperienceSection({ view, perms }: { view: CandidateView; perms: Perms }) {
  return (
    <SectionCard title="Experience" description="Validate entries after checking references or evidence.">
      {view.experience.length ? (
        <ul className="space-y-3">
          {view.experience.map((e) => (
            <li key={e.id} className="rounded-lg border border-border p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium">{e.jobTitle}</p>
                  <p className="text-sm text-muted-foreground">
                    {e.employerName ?? "Employer hidden by the candidate"}
                    {e.city || e.countryCode ? ` · ${[e.city, e.countryCode].filter(Boolean).join(", ")}` : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">{dateRange(e.startDate, e.endDate, e.isCurrent)}</p>
                </div>
                <VerificationBadge state={e.verificationStatus} />
              </div>
              {e.responsibilities ? <p className="mt-2 text-sm whitespace-pre-line">{e.responsibilities}</p> : null}
              {e.reference ? <p className="mt-2 text-xs text-muted-foreground">Reference: {e.reference.name ?? "—"} {e.reference.contact ? `· ${e.reference.contact}` : "(contact shown after a contact reveal)"}</p> : null}
              <div className="mt-2 flex flex-wrap gap-2">
                {e.evidence && perms.canOpen ? <OpenDocumentButton candidateId={view.candidateId} fileId={e.evidence.id} label={`evidence for ${e.jobTitle}`} action={openDocumentAction} /> : null}
                {perms.canVerify && e.verificationStatus !== "verified" ? (
                  <ActionButton icon={<CheckCircle2 aria-hidden="true" />} action={verifyExperienceAction.bind(null, { id: e.id, status: "verified" })}>
                    Verify
                  </ActionButton>
                ) : null}
                {perms.canVerify && e.verificationStatus !== "rejected" ? (
                  <ReasonDialog action={verifyEntryFormAction} hidden={{ id: e.id, entry: "experience", status: "rejected" }} reasonName="note" reasonLabel="Why it could not be verified" triggerLabel="Reject" title={`Reject “${e.jobTitle}”?`} description="The candidate sees this reason." confirmLabel="Reject" variant="ghost" />
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState size="sm" variant="plain" title="No experience added" description="The candidate has not added work experience yet." />
      )}
    </SectionCard>
  );
}

export function EducationSection({ view, perms }: { view: CandidateView; perms: Perms }) {
  return (
    <SectionCard title="Education">
      {view.education.length ? (
        <ul className="space-y-3">
          {view.education.map((e) => (
            <li key={e.id} className="rounded-lg border border-border p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium">{e.qualification ?? e.educationLevel?.name ?? "Qualification"}</p>
                  <p className="text-sm text-muted-foreground">
                    {e.institutionName}
                    {e.boardOrUniversity ? ` · ${e.boardOrUniversity}` : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">{dateRange(e.startDate, e.endDate, e.isCurrent)}</p>
                </div>
                <VerificationBadge state={e.verificationStatus} />
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {e.document && perms.canOpen ? <OpenDocumentButton candidateId={view.candidateId} fileId={e.document.id} label={`document for ${e.institutionName}`} action={openDocumentAction} /> : null}
                {perms.canVerify && e.verificationStatus !== "verified" ? (
                  <ActionButton icon={<CheckCircle2 aria-hidden="true" />} action={verifyEducationAction.bind(null, { id: e.id, status: "verified" })}>
                    Verify
                  </ActionButton>
                ) : null}
                {perms.canVerify && e.verificationStatus !== "rejected" ? (
                  <ReasonDialog action={verifyEntryFormAction} hidden={{ id: e.id, entry: "education", status: "rejected" }} reasonName="note" reasonLabel="Why it could not be verified" triggerLabel="Reject" title="Reject this education entry?" description="The candidate sees this reason." confirmLabel="Reject" variant="ghost" />
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState size="sm" variant="plain" title="No education added" />
      )}
    </SectionCard>
  );
}

/** Documents and credentials: verification decisions go through the approval centre. */
export function DocumentsSection({ view, perms }: { view: CandidateView; perms: Perms }) {
  return (
    <SectionCard title="Documents" description="Private. Opening a document needs a reason and is logged.">
      {view.documents.length ? (
        <ul className="space-y-3">
          {view.documents.map((d) => {
            const label = d.title ?? humanize(d.documentType);
            return (
              <li key={d.id} className="rounded-lg border border-border p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium">{label}</p>
                    <p className="text-xs text-muted-foreground">
                      {humanize(d.documentType)}
                      {d.numberLast4 ? ` · ending ${d.numberLast4}` : ""}
                      {d.expiresAt ? <> · expires <DateText value={d.expiresAt} dateOnly /></> : null}
                      {d.isShareableWithEmployers ? " · shareable with employers" : " · not shared with employers"}
                    </p>
                    {d.rejectionReason ? <p className="mt-1 text-xs text-danger-strong">{d.rejectionReason}</p> : null}
                  </div>
                  <VerificationBadge state={d.verificationStatus} />
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {d.file && perms.canOpen ? <OpenDocumentButton candidateId={view.candidateId} fileId={d.file.id} label={label} action={openDocumentAction} /> : null}
                  {perms.canVerify && d.file && d.verificationStatus !== "verified" ? (
                    <ReasonDialog
                      action={decideItemFormAction}
                      hidden={{ candidateId: view.candidateId, itemId: d.id, kind: "document" }}
                      triggerLabel="Review"
                      title={`Review ${label}`}
                      description="A rejection or change request needs a reason, which the candidate sees."
                      confirmLabel="Save decision"
                      reasonRequired={false}
                      choice={{ name: "decision", label: "Decision", options: DECISIONS, required: true }}
                    />
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState size="sm" variant="plain" title="No documents uploaded" />
      )}
    </SectionCard>
  );
}

export function CredentialsSection({ view, perms }: { view: CandidateView; perms: Perms }) {
  return (
    <SectionCard title="Credentials" description="Venkat Sai and institution certificates are issued by the platform and cannot be edited here.">
      {view.credentials.length ? (
        <ul className="space-y-3">
          {view.credentials.map((c) => {
            const platform = c.issuerType === "venkat_sai" || c.issuerType === "institution";
            return (
              <li key={c.id} className="rounded-lg border border-border p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium">{c.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {humanize(c.credentialType)} · {c.issuer ?? humanize(c.issuerType)}
                      {c.issuerType === "venkat_sai" ? " · Venkat Sai assessment, not an accredited certification" : ""}
                      {c.issuerType === "self_declared" ? " · self-declared" : ""}
                    </p>
                    {c.rejectionReason ? <p className="mt-1 text-xs text-danger-strong">{c.rejectionReason}</p> : null}
                  </div>
                  <VerificationBadge state={c.verificationStatus} />
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {c.file && perms.canOpen ? <OpenDocumentButton candidateId={view.candidateId} fileId={c.file.id} label={c.name} action={openDocumentAction} /> : null}
                  {perms.canVerify && !platform && c.file && c.verificationStatus !== "verified" ? (
                    <ReasonDialog
                      action={decideItemFormAction}
                      hidden={{ candidateId: view.candidateId, itemId: c.id, kind: "credential" }}
                      triggerLabel="Review"
                      title={`Review ${c.name}`}
                      description="Check the copy against the issuer's records. A rejection or change request needs a reason."
                      confirmLabel="Save decision"
                      reasonRequired={false}
                      choice={{ name: "decision", label: "Decision", options: DECISIONS, required: true }}
                    />
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState size="sm" variant="plain" title="No credentials added" />
      )}
    </SectionCard>
  );
}
