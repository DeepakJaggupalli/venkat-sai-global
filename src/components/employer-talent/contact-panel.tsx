"use client";

import { Eye, LockKeyhole, Mail, Phone, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { track } from "@/modules/analytics/client";
import { revealCandidateContactAction, unlockCandidateAction } from "@/modules/recruitment/actions";

type Contact = { email: string | null; phone: string | null };

export type ContactPanelProps = {
  candidateId: string;
  /** From getCandidateView(): "full" (already revealed), "masked" (entitled, reveal logged) or "hidden" (unlock needed). */
  state: "full" | "masked" | "hidden";
  masked: Contact;
  full?: Contact;
  hiddenReason?: "unlock_or_application_required" | "permission_required";
  canUnlock: boolean;
  orgVerified: boolean;
  /** Remaining unlock credits (null = unlimited or not enforced). */
  creditsRemaining: number | null;
  creditsEnforced: boolean;
  unlockDays: number;
};

function ContactLines({ contact }: { contact: Contact }) {
  return (
    <dl className="space-y-2 text-sm" aria-live="polite">
      <div className="flex items-center gap-2">
        <Mail aria-hidden className="size-4 text-muted-foreground" />
        <dt className="sr-only">Email</dt>
        <dd className="min-w-0 break-all">{contact.email ? <a className="text-teal-strong underline-offset-4 hover:underline" href={`mailto:${contact.email}`}>{contact.email}</a> : "Not provided"}</dd>
      </div>
      <div className="flex items-center gap-2">
        <Phone aria-hidden className="size-4 text-muted-foreground" />
        <dt className="sr-only">Phone</dt>
        <dd>{contact.phone ? <a className="text-teal-strong underline-offset-4 hover:underline" href={`tel:${contact.phone}`}>{contact.phone}</a> : "Not provided"}</dd>
      </div>
    </dl>
  );
}

/**
 * Contact details on the employer's candidate view. Revealing is logged in the candidate's access
 * history; unlocking a profile without an application uses one candidate-unlock credit (confirmed first).
 */
export function ContactPanel(props: ContactPanelProps) {
  const router = useRouter();
  const [revealed, setRevealed] = useState<Contact | null>(props.full ?? null);
  const [pending, startTransition] = useTransition();

  const reveal = () =>
    startTransition(async () => {
      const result = await revealCandidateContactAction({ candidateId: props.candidateId });
      if (!result.ok || !result.data) {
        toast.error(result.ok ? "Contact details could not be loaded." : result.error);
        return;
      }
      setRevealed({ email: result.data.email, phone: result.data.phone });
    });

  if (revealed) {
    return (
      <div className="space-y-3">
        <ContactLines contact={revealed} />
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          This view is recorded in the candidate&apos;s access history. Use these details only for recruitment.
        </p>
        <Button type="button" variant="ghost" size="sm" onClick={() => setRevealed(null)}>
          Hide contact details
        </Button>
      </div>
    );
  }

  if (props.state === "masked" || props.state === "full") {
    return (
      <div className="space-y-3">
        <ContactLines contact={props.masked} />
        <Button type="button" variant="outline" size="sm" onClick={reveal} disabled={pending} aria-disabled={pending}>
          <Eye aria-hidden className="size-4" />
          {pending ? "Loading…" : "Show contact details"}
        </Button>
        <p className="text-xs text-muted-foreground">Revealing is recorded in the access log.</p>
      </div>
    );
  }

  if (props.hiddenReason === "permission_required" || !props.canUnlock) {
    return (
      <p className="flex items-start gap-2 text-sm text-muted-foreground">
        <LockKeyhole aria-hidden className="mt-0.5 size-4 shrink-0" />
        Contact details are shown after the candidate applies to one of your jobs, or when a team member with unlock permission unlocks the profile.
      </p>
    );
  }

  if (!props.orgVerified) {
    return (
      <p className="flex items-start gap-2 text-sm text-muted-foreground">
        <LockKeyhole aria-hidden className="mt-0.5 size-4 shrink-0" />
        Unlocking contact details is available once Venkat Sai has verified your company.
      </p>
    );
  }

  const noCredits = props.creditsEnforced && props.creditsRemaining !== null && props.creditsRemaining <= 0;
  const creditLine =
    props.creditsRemaining === null || !props.creditsEnforced
      ? "Unlocking uses one candidate-unlock credit."
      : `Unlocking uses one candidate-unlock credit. You have ${props.creditsRemaining} ${props.creditsRemaining === 1 ? "credit" : "credits"} left.`;

  return (
    <div className="space-y-3">
      <p className="flex items-start gap-2 text-sm text-muted-foreground">
        <LockKeyhole aria-hidden className="mt-0.5 size-4 shrink-0" />
        Contact details are hidden until the candidate applies to one of your jobs or you unlock the profile.
      </p>
      {noCredits ? (
        <Button asChild size="sm" variant="outline">
          <a href="/employer/billing">Buy unlock credits</a>
        </Button>
      ) : (
        <ConfirmDialog
          trigger={
            <Button type="button" size="sm" data-testid="unlock-contact">
              Unlock contact details
            </Button>
          }
          title="Unlock this candidate's contact details?"
          description={
            <span className="block space-y-2">
              <span className="block">{creditLine} No credit is used if you already unlocked this profile in the last {props.unlockDays} days or the candidate applied to your job.</span>
              <span className="block">The unlock lasts {props.unlockDays} days. The candidate can see that your organisation accessed their details, and every view is logged.</span>
            </span>
          }
          confirmLabel="Unlock"
          pendingLabel="Unlocking…"
          successMessage={false}
          onConfirm={async () => {
            const result = await unlockCandidateAction({ candidateId: props.candidateId });
            if (!result.ok || !result.data) return result.ok ? { ok: false, error: "Contact details could not be unlocked." } : result;
            track("cta_click", { cta: "candidate_unlock", creditUsed: result.data.creditConsumed });
            toast.success(result.data.creditConsumed ? "Contact details unlocked. One credit used." : "Contact details unlocked. No credit was needed.");
            setRevealed({ email: result.data.contact.email, phone: result.data.contact.phone });
            router.refresh();
            return result;
          }}
        />
      )}
    </div>
  );
}
