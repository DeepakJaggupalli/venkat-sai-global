"use client";

import { Award } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { FileUpload } from "@/components/files";
import { Callout } from "@/components/shared/callout";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { FormErrorAlert, FormField, SubmitButton, useActionToast } from "@/components/shared/form";
import { ResponsiveDialog } from "@/components/shared/responsive-dialog";
import { SearchableSelect, SimpleSelect } from "@/components/shared/selects";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { issueCertificateAction, revokeCertificateAction } from "@/modules/training/actions";

import { ISSUER_TYPE_SHORT } from "./labels";
import { useInstitutionForm } from "./use-form-action";

export type IssuableOption = {
  enrolmentId: string;
  label: string;
  certificationType: string;
  accreditationBody: string | null;
  passed: boolean;
};

const LABELS = {
  enrolmentId: "Learner and course",
  issuerType: "Certificate type",
  title: "Certificate title",
  description: "Description",
  expiresOn: "Expiry date",
  externalCertificateNumber: "Awarding body certificate number",
  fileId: "Certificate file",
};

function IssueForm({ organizationId, options, authorisedIssuer, onDone }: { organizationId: string; options: IssuableOption[]; authorisedIssuer: boolean; onDone: () => void }) {
  const router = useRouter();
  const { state, pending, onSubmit } = useInstitutionForm(issueCertificateAction);
  const [enrolmentId, setEnrolmentId] = useState("");
  const [uploading, setUploading] = useState(false);
  const selected = options.find((o) => o.enrolmentId === enrolmentId);
  const accreditedAllowed = Boolean(selected && authorisedIssuer && selected.certificationType === "accredited_external" && selected.passed);
  const typeOptions = useMemo(
    () => [
      { value: "institution_completion", label: ISSUER_TYPE_SHORT.institution_completion! },
      ...(accreditedAllowed ? [{ value: "accredited_external", label: `${ISSUER_TYPE_SHORT.accredited_external} · ${selected?.accreditationBody ?? ""}` }] : []),
    ],
    [accreditedAllowed, selected],
  );
  const [chosenType, setIssuerType] = useState("institution_completion");
  const issuerType = accreditedAllowed ? chosenType : "institution_completion";
  useActionToast(state);
  useEffect(() => {
    if (state?.ok) {
      router.refresh();
      onDone();
    }
  }, [state, router, onDone]);

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <FormErrorAlert state={state} fieldLabels={LABELS} />
      <FormField label={LABELS.enrolmentId} name="enrolmentId" required state={state} hint="Completed enrolments in your own courses without an active certificate.">
        <SearchableSelect options={options.map((o) => ({ value: o.enrolmentId, label: o.label }))} value={enrolmentId} onValueChange={setEnrolmentId} placeholder="Choose a learner" />
      </FormField>
      <FormField label={LABELS.issuerType} name="issuerType" required state={state}>
        <SimpleSelect options={typeOptions} value={issuerType} onValueChange={setIssuerType} />
      </FormField>
      {selected?.certificationType === "accredited_external" && !accreditedAllowed ? (
        <p className="text-sm text-muted-foreground">
          {!authorisedIssuer
            ? "Accredited certificates need a current certificate-issuer authorisation from Venkat Sai. You can issue a certificate of completion."
            : "Accredited certificates can be issued only to learners who passed."}
        </p>
      ) : null}
      <FormField label={LABELS.title} name="title" optional state={state} hint="Leave empty to use the course title.">
        <Input maxLength={200} />
      </FormField>
      <FormField label={LABELS.description} name="description" optional state={state}>
        <Textarea rows={2} maxLength={2000} />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label={LABELS.expiresOn} name="expiresOn" optional state={state} hint="Only if the certificate has a printed expiry date.">
          <Input type="date" />
        </FormField>
        {issuerType === "accredited_external" ? (
          <FormField label={LABELS.externalCertificateNumber} name="externalCertificateNumber" optional state={state}>
            <Input maxLength={100} />
          </FormField>
        ) : null}
      </div>
      <FileUpload
        purpose="certificate"
        name="fileId"
        organizationId={organizationId}
        label={LABELS.fileId}
        description="Optional signed certificate (PDF or image, up to 10 MB). The learner gets access to it."
        onUploadingChange={setUploading}
      />
      <div className="flex justify-end">
        <SubmitButton pending={pending} disabled={uploading || !enrolmentId} pendingLabel="Issuing…">
          Issue certificate
        </SubmitButton>
      </div>
    </form>
  );
}

/** "Issue certificate" button + dialog (verified institutions only; the training service applies the issuing matrix). */
export function IssueCertificateButton({ organizationId, options, authorisedIssuer, verified }: { organizationId: string; options: IssuableOption[]; authorisedIssuer: boolean; verified: boolean }) {
  const [open, setOpen] = useState(false);
  if (!verified) {
    return (
      <Callout tone="info" title="Certificates are issued once you are verified" action={{ label: "Go to verification", href: "/institution/profile#verification" }}>
        Venkat Sai verifies your registration and accreditation or affiliation first.
      </Callout>
    );
  }
  return (
    <>
      <Button onClick={() => setOpen(true)} disabled={!options.length}>
        <Award aria-hidden="true" /> Issue certificate
      </Button>
      {!options.length ? <p className="mt-2 text-sm text-muted-foreground">No completed enrolments are waiting for a certificate.</p> : null}
      <ResponsiveDialog open={open} onOpenChange={setOpen} title="Issue a certificate" description="The learner is notified and the certificate can be checked on the public verification page." size="lg">
        <IssueForm organizationId={organizationId} options={options} authorisedIssuer={authorisedIssuer} onDone={() => setOpen(false)} />
      </ResponsiveDialog>
    </>
  );
}

export function RevokeCertificateButton({ certificateId, label }: { certificateId: string; label: string }) {
  const router = useRouter();
  return (
    <ConfirmDialog
      trigger={
        <Button variant="ghost" size="sm">
          Revoke<span className="sr-only"> {label}</span>
        </Button>
      }
      title={`Revoke ${label}?`}
      description="The certificate shows as revoked on the public verification page and the learner is notified with your reason. This cannot be undone."
      confirmLabel="Revoke certificate"
      variant="destructive"
      onConfirm={async (fd) => {
        fd.set("certificateId", certificateId);
        fd.set("via", "institution");
        const result = await revokeCertificateAction(null, fd);
        if (result.ok) router.refresh();
        return result;
      }}
    >
      <div className="space-y-2">
        <Label htmlFor={`revoke-${certificateId}`}>Reason shown to the learner</Label>
        <Textarea id={`revoke-${certificateId}`} name="reason" rows={3} maxLength={1000} required />
      </div>
    </ConfirmDialog>
  );
}
