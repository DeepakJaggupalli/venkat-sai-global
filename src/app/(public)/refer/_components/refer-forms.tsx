"use client";

import { ArrowRight, Search } from "lucide-react";
import { useActionState, useRef, useState, type FormEvent } from "react";
import { useFormStatus } from "react-dom";

import { ConsentCheckbox, Honeypot } from "@/components/public/forms/form-parts";
import { WhatsAppButton } from "@/components/public/requirements/contact-buttons";
import { FormErrorAlert, FormField } from "@/components/shared/form";
import { keepFormValues } from "@/components/shared/form/keep-values";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

import { checkMyReferralsAction, getReferralLinkAction } from "../actions";
import { MyReferrals } from "./my-referrals";
import { ShareLinkCard } from "./share-link-card";
import { CARD, INPUT, PILL_DARK } from "./styles";

function PillSubmit({ children, pendingLabel, testId }: { children: string; pendingLabel: string; testId?: string }) {
  const { pending } = useFormStatus();
  return (
    <>
      <span aria-live="polite" className="sr-only">
        {pending ? pendingLabel : ""}
      </span>
      <button
        type="submit"
        aria-disabled={pending || undefined}
        onClick={(e) => {
          if (pending) e.preventDefault();
        }}
        className={cn(PILL_DARK, "w-full sm:w-auto", pending && "cursor-wait opacity-80")}
        data-testid={testId}
      >
        {pending ? <Spinner aria-hidden="true" role="presentation" /> : null}
        <span>{pending ? pendingLabel : children}</span>
        {pending ? null : <ArrowRight aria-hidden="true" />}
      </button>
    </>
  );
}

function scrollToSection(id: string) {
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  document.getElementById(id)?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
}

/**
 * Both /refer forms: "Get my link" (name + mobile → the personal link to share) and "Check my referrals" (mobile +
 * code → the people who sent a CV through the link). Server actions with progressive enhancement; typed values are
 * kept after an error. "See my referrals" fills the check form with the number just typed and the code, then sends it.
 */
export function ReferForms() {
  const [linkState, linkAction] = useActionState(getReferralLinkAction, null);
  const [checkState, checkAction] = useActionState(checkMyReferralsAction, null);
  const [dismissed, setDismissed] = useState<typeof linkState>(null);
  const typedPhone = useRef("");
  const checkForm = useRef<HTMLFormElement>(null);

  const link = linkState?.ok && linkState.data && dismissed !== linkState ? linkState.data : null;
  const referrals = checkState?.ok ? checkState.data : undefined;

  const rememberPhone = (event: FormEvent<HTMLFormElement>) => {
    typedPhone.current = String(new FormData(event.currentTarget).get("phone") ?? "");
  };

  const seeReferrals = (code: string) => {
    const form = checkForm.current;
    if (!form) return;
    const phone = form.elements.namedItem("phone");
    const codeInput = form.elements.namedItem("code");
    if (phone instanceof HTMLInputElement) phone.value = typedPhone.current;
    if (codeInput instanceof HTMLInputElement) codeInput.value = code;
    scrollToSection("check");
    form.requestSubmit();
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
      <section id="get-link" aria-labelledby="get-link-heading" className={cn(CARD, "scroll-mt-24")}>
        {link ? (
          <ShareLinkCard result={link} onSeeReferrals={() => seeReferrals(link.code)} onStartAgain={() => setDismissed(linkState)} />
        ) : (
          <form action={linkAction} onSubmit={rememberPhone} onResetCapture={keepFormValues} noValidate className="space-y-5" data-testid="referral-link-form">
            <div>
              <h2 id="get-link-heading" className="font-display text-2xl text-foreground sm:text-3xl">
                Get your link
              </h2>
              <p className="mt-2 text-base text-muted-foreground">Takes one minute. If you already have a link, we show it again.</p>
            </div>
            <FormErrorAlert state={linkState} title="We could not show your link" />
            {linkState && !linkState.ok && (linkState.code === "name_mismatch" || linkState.code === "blocked") ? (
              <WhatsAppButton message="Hello Venkat Sai, please send me my referral link." label="WhatsApp us for my link" className="w-full sm:w-auto" />
            ) : null}
            <Honeypot />
            <FormField label="Your name" name="name" required state={linkState}>
              <Input autoComplete="name" maxLength={120} className={INPUT} />
            </FormField>
            <FormField label="Mobile / WhatsApp number" name="phone" required state={linkState} hint="We pay the reward to the person with this number. Add the country code if it is not Indian, for example +971.">
              <Input type="tel" inputMode="tel" autoComplete="tel" maxLength={20} placeholder="98765 43210" className={INPUT} />
            </FormField>
            <ConsentCheckbox state={linkState} label="I agree that Venkat Sai Global may call or WhatsApp me about my referrals and rewards." />
            <PillSubmit pendingLabel="Getting your link…" testId="referral-link-submit">
              Get my link
            </PillSubmit>
          </form>
        )}
      </section>

      <section id="check" aria-labelledby="check-heading" className={cn(CARD, "scroll-mt-24 space-y-6")}>
        <form ref={checkForm} action={checkAction} onResetCapture={keepFormValues} noValidate className="space-y-5" data-testid="referral-check-form">
          <div>
            <h2 id="check-heading" className="font-display text-2xl text-foreground sm:text-3xl">
              Check my referrals
            </h2>
            <p className="mt-2 text-base text-muted-foreground">See who sent a CV through your link and when a reward is due.</p>
          </div>
          <FormErrorAlert state={checkState} title="We could not show your referrals" />
          <FormField label="Mobile / WhatsApp number" name="phone" required state={checkState} hint="The number you gave when you got your link.">
            <Input type="tel" inputMode="tel" autoComplete="tel" maxLength={20} placeholder="98765 43210" className={INPUT} />
          </FormField>
          <FormField label="Your code or link" name="code" required state={checkState} hint="The 6 letters and numbers at the end of your link. You can also paste the whole link.">
            <Input autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={300} placeholder="7KQ2MX" className={cn(INPUT, "font-mono")} />
          </FormField>
          <CheckSubmit />
        </form>
        <div aria-live="polite">{referrals ? <MyReferrals view={referrals} /> : null}</div>
      </section>
    </div>
  );
}

function CheckSubmit() {
  const { pending } = useFormStatus();
  return (
    <>
      <span aria-live="polite" className="sr-only">
        {pending ? "Checking" : ""}
      </span>
      <button
        type="submit"
        aria-disabled={pending || undefined}
        onClick={(e) => {
          if (pending) e.preventDefault();
        }}
        className={cn(PILL_DARK, "w-full sm:w-auto", pending && "cursor-wait opacity-80")}
        data-testid="referral-check-submit"
      >
        {pending ? <Spinner aria-hidden="true" role="presentation" /> : <Search aria-hidden="true" />}
        <span>{pending ? "Checking…" : "Check my referrals"}</span>
      </button>
    </>
  );
}
