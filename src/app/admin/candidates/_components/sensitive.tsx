"use client";

import { Eye, EyeOff, FileText, ShieldAlert } from "lucide-react";
import { useId, useState } from "react";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult } from "@/lib/actions";

type RevealFn<T> = (input: { candidateId: string; reason: string }) => Promise<ActionResult<T>>;

function ReasonField({ id, hint }: { id: string; hint: string }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>Reason</Label>
      <Textarea id={id} name="reason" rows={3} required minLength={3} maxLength={300} aria-describedby={`${id}-hint`} />
      <p id={`${id}-hint`} className="text-xs text-muted-foreground">
        {hint}
      </p>
    </div>
  );
}

/**
 * Masked contact details with a "Reveal" flow that asks for a reason. The real values are fetched only
 * after confirmation (logged by the candidates module) and cleared again with "Hide".
 */
export function RevealContact({ candidateId, maskedEmail, maskedPhone, action, canReveal }: { candidateId: string; maskedEmail: string | null; maskedPhone: string | null; action: RevealFn<{ email: string | null; phone: string | null }>; canReveal: boolean }) {
  const id = useId();
  const [value, setValue] = useState<{ email: string | null; phone: string | null } | null>(null);
  return (
    <div className="space-y-3">
      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs text-muted-foreground">Email</dt>
          <dd className="font-medium break-all">{value ? (value.email ?? "Not provided") : (maskedEmail ?? "Not provided")}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Phone</dt>
          <dd className="font-medium">{value ? (value.phone ?? "Not provided") : (maskedPhone ?? "Not provided")}</dd>
        </div>
      </dl>
      <p className="sr-only" aria-live="polite">
        {value ? "Contact details revealed." : ""}
      </p>
      {value ? (
        <Button variant="outline" size="sm" onClick={() => setValue(null)}>
          <EyeOff aria-hidden="true" /> Hide
        </Button>
      ) : canReveal ? (
        <ConfirmDialog
          trigger={
            <Button variant="outline" size="sm" data-testid="reveal-contact">
              <Eye aria-hidden="true" /> Reveal contact
            </Button>
          }
          title="Reveal contact details?"
          description="Revealing is recorded in the access log with your reason."
          confirmLabel="Reveal"
          successMessage={false}
          onConfirm={async (fd: FormData) => {
            const result = await action({ candidateId, reason: String(fd.get("reason") ?? "") });
            if (result.ok && result.data) setValue(result.data);
            return result;
          }}
        >
          <ReasonField id={`${id}-contact`} hint="For example: calling to arrange a trade test." />
        </ConfirmDialog>
      ) : (
        <p className="text-xs text-muted-foreground">Revealing contact details needs the contact-reveal permission.</p>
      )}
    </div>
  );
}

export type IdentityValues = {
  legalName: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  nationalityCode: string | null;
  passportNumberLast4: string | null;
  passportExpiry: string | null;
  emigrationCheckStatus: string | null;
};

/** Identity details behind a reason dialog (candidates.view_documents; logged). */
export function RevealIdentity({ candidateId, action, available }: { candidateId: string; action: RevealFn<IdentityValues>; available: boolean }) {
  const id = useId();
  const [value, setValue] = useState<IdentityValues | null>(null);
  if (!available) return <p className="text-sm text-muted-foreground">No identity details recorded, or you do not have access to them.</p>;
  if (value) {
    const rows: [string, string | null][] = [
      ["Legal name", value.legalName],
      ["Date of birth", value.dateOfBirth],
      ["Gender", value.gender ? value.gender.replace(/_/g, " ") : null],
      ["Nationality", value.nationalityCode],
      ["Passport", value.passportNumberLast4 ? `ending ${value.passportNumberLast4}` : null],
      ["Passport expiry", value.passportExpiry],
      ["Emigration check", value.emigrationCheckStatus ? value.emigrationCheckStatus.toUpperCase() : null],
    ];
    return (
      <div className="space-y-3">
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          {rows.map(([label, v]) => (
            <div key={label}>
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="font-medium">{v ?? "Not provided"}</dd>
            </div>
          ))}
        </dl>
        <Button variant="outline" size="sm" onClick={() => setValue(null)}>
          <EyeOff aria-hidden="true" /> Hide
        </Button>
      </div>
    );
  }
  return (
    <ConfirmDialog
      trigger={
        <Button variant="outline" size="sm">
          <ShieldAlert aria-hidden="true" /> Show identity details
        </Button>
      }
      title="Show identity details?"
      description="Legal name, date of birth, nationality and passport details. Viewing is recorded in the access log with your reason."
      confirmLabel="Show"
      successMessage={false}
      onConfirm={async (fd: FormData) => {
        const result = await action({ candidateId, reason: String(fd.get("reason") ?? "") });
        if (result.ok && result.data) setValue(result.data);
        return result;
      }}
    >
      <ReasonField id={`${id}-identity`} hint="For example: preparing emigration clearance." />
    </ConfirmDialog>
  );
}

type OpenFn = (input: { candidateId: string; fileId: string; reason: string }) => Promise<ActionResult<{ url: string }>>;

/** "Open document" behind a reason dialog; opens the authorised file URL in a new tab after logging. */
export function OpenDocumentButton({ candidateId, fileId, label, action }: { candidateId: string; fileId: string; label: string; action: OpenFn }) {
  const id = useId();
  const [url, setUrl] = useState<string | null>(null);
  if (url) {
    // Popup blockers may stop window.open after the async check, so a real link is always offered.
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-sm font-medium text-teal-strong hover:bg-surface-subtle">
        <FileText aria-hidden="true" className="size-4" /> Open {label}
      </a>
    );
  }
  return (
    <ConfirmDialog
      trigger={
        <Button variant="outline" size="sm">
          <FileText aria-hidden="true" /> Open
          <span className="sr-only"> {label}</span>
        </Button>
      }
      title={`Open ${label}?`}
      description="Opening a candidate document is recorded in the access log with your reason."
      confirmLabel="Open document"
      successMessage={false}
      onConfirm={async (fd: FormData) => {
        const result = await action({ candidateId, fileId, reason: String(fd.get("reason") ?? "") });
        if (result.ok && result.data) {
          setUrl(result.data.url);
          window.open(result.data.url, "_blank", "noopener,noreferrer");
        }
        return result;
      }}
    >
      <ReasonField id={`${id}-doc`} hint="For example: verifying the passport for a visa application." />
    </ConfirmDialog>
  );
}
