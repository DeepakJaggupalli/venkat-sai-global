"use client";

import { ArrowRight, CheckCircle2 } from "lucide-react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { ConsentCheckbox, Honeypot } from "@/components/public/forms/form-parts";
import { FormErrorAlert, FormField } from "@/components/shared/form";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

import { CARD, INPUT, PILL_DARK } from "../../refer/_components/styles";
import { applyForInternshipAction } from "../actions";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" aria-disabled={pending || undefined} onClick={(e) => pending && e.preventDefault()} className={cn(PILL_DARK, "w-full sm:w-auto", pending && "cursor-wait opacity-80")} data-testid="internship-apply-submit">
      {pending ? <Spinner aria-hidden="true" role="presentation" /> : null}
      <span>{pending ? "Sending…" : "Apply for this internship"}</span>
      {pending ? null : <ArrowRight aria-hidden="true" />}
    </button>
  );
}

/** Apply to one internship: name, WhatsApp number, optional email and college. No account needed. */
export function InternshipApplyForm({ programmeId, programmeTitle }: { programmeId: string; programmeTitle: string }) {
  const [state, action] = useActionState(applyForInternshipAction, null);

  if (state?.ok) {
    return (
      <div className={cn(CARD, "text-center")} role="status" data-testid="internship-applied">
        <CheckCircle2 aria-hidden="true" className="mx-auto size-10 text-success-strong" />
        <h2 className="mt-3 font-heading text-xl font-semibold text-navy">Application sent</h2>
        <p className="mx-auto mt-2 max-w-md text-muted-foreground">
          Thank you. We will contact you on WhatsApp about {programmeTitle}. When you are selected you get an offer letter, and when you finish, an internship certificate and a letter of recommendation.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className={cn(CARD, "space-y-5")} data-testid="internship-apply-form" noValidate>
      <h2 className="font-heading text-xl font-semibold text-navy">Apply now</h2>
      <FormErrorAlert state={state} />
      <input type="hidden" name="programmeId" value={programmeId} />
      <Honeypot />
      <div className="grid gap-5 sm:grid-cols-2">
        <FormField label="Your full name" name="fullName" required state={state} hint="As it should appear on your certificate, in English letters.">
          <Input className={INPUT} autoComplete="name" maxLength={120} />
        </FormField>
        <FormField label="WhatsApp number" name="phone" required state={state} hint="With country code if you are outside India.">
          <Input className={INPUT} type="tel" inputMode="tel" autoComplete="tel" maxLength={20} />
        </FormField>
        <FormField label="Email" name="email" optional state={state}>
          <Input className={INPUT} type="email" autoComplete="email" maxLength={200} />
        </FormField>
        <FormField label="College or institute" name="institutionName" optional state={state}>
          <Input className={INPUT} maxLength={200} />
        </FormField>
      </div>
      <ConsentCheckbox state={state ?? undefined} label="Venkat Sai may call or WhatsApp me about this internship." />
      <Submit />
    </form>
  );
}
