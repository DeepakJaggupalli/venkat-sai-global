"use client";

import { useRouter } from "next/navigation";
import { useActionState, useCallback, useEffect, useId } from "react";

import { FormErrorAlert, SubmitButton } from "@/components/shared/form";
import { keepFormValues } from "@/components/shared/form/keep-values";
import { useT } from "@/i18n/client";
import { track } from "@/modules/analytics/client";

import { applyToBatchFormAction } from "../../../actions";

type ApplyFormProps = {
  batchId: string;
  courseId: string;
  providerName: string;
  /** The batch is full: the application joins the waitlist. */
  waitlist: boolean;
};

/**
 * Batch application: states exactly what is shared with the training provider (name, email, phone) and asks
 * for the contact-sharing consent and a declaration. Never implies a job guarantee.
 */
export function ApplyForm({ batchId, courseId, providerName, waitlist }: ApplyFormProps) {
  const t = useT("talent-training");
  const router = useRouter();
  const id = useId();
  // Success is confirmed (translated) on the enrolment page; the module's own message is English-only.
  // Navigate from the action itself, not from an effect on `state`: the action revalidates the training
  // pages, and the refreshed apply page shows "already applied" instead of this form, so an effect never ran
  // and the candidate was left on the apply page.
  const submit = useCallback<typeof applyToBatchFormAction>(
    async (prev, formData) => {
      const result = await applyToBatchFormAction(prev, formData);
      if (result.ok) {
        track("course_enrolment_completed", { courseId, status: result.data?.status ?? null });
        router.push(result.data?.id ? `/talent/training/enrolments/${result.data.id}?applied=1` : "/talent/training");
      }
      return result;
    },
    [courseId, router],
  );
  const [state, formAction] = useActionState(submit, null);

  useEffect(() => {
    track("course_enrolment_started", { courseId });
  }, [courseId]);

  const errors = state && !state.ok ? state.fieldErrors : undefined;
  const sharingError = errors?.acknowledgeContactSharing ? t("apply.errors.contactSharing") : null;
  const declarationError = errors?.declaration ? t("apply.errors.declaration") : null;

  return (
    <form action={formAction} onResetCapture={keepFormValues} className="space-y-5" noValidate data-testid="apply-form">
      <FormErrorAlert state={state} title={t("apply.formError")} />
      <input type="hidden" name="batchId" value={batchId} />

      <fieldset className="space-y-4">
        <legend className="font-heading text-base font-semibold text-navy">{t("apply.consentTitle")}</legend>
        <div className="rounded-lg border border-border bg-surface-subtle p-4 text-sm text-foreground/80">
          <p>{t("apply.sharingExplanation", { provider: providerName })}</p>
          <ul className="mt-2 list-disc space-y-0.5 pl-5">
            <li>{t("apply.sharedName")}</li>
            <li>{t("apply.sharedEmail")}</li>
            <li>{t("apply.sharedPhone")}</li>
          </ul>
          <p className="mt-2">{t("apply.sharingPurpose")}</p>
        </div>

        <CheckboxRow
          id={`${id}-sharing`}
          name="acknowledgeContactSharing"
          label={t("apply.acknowledgeSharing", { provider: providerName })}
          error={sharingError}
        />
        <CheckboxRow id={`${id}-declaration`} name="declaration" label={t("apply.declaration")} error={declarationError} />
      </fieldset>

      <p className="text-sm text-muted-foreground">{t("apply.noGuarantee")}</p>

      <SubmitButton pendingLabel={t("apply.submitting")}>{waitlist ? t("apply.submitWaitlist") : t("apply.submit")}</SubmitButton>
    </form>
  );
}

function CheckboxRow({ id, name, label, error }: { id: string; name: string; label: string; error: string | null }) {
  return (
    <div>
      <div className="flex items-start gap-3">
        <input
          id={id}
          name={name}
          type="checkbox"
          required
          aria-required="true"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className="mt-0.5 size-5 shrink-0 rounded border-input accent-[var(--color-teal-strong)] focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        />
        <label htmlFor={id} className="text-sm text-foreground">
          {label}
        </label>
      </div>
      {error ? (
        <p id={`${id}-error`} className="mt-1 pl-8 text-sm text-danger-strong">
          {error}
        </p>
      ) : null}
    </div>
  );
}
