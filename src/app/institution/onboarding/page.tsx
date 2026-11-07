import type { Metadata } from "next";
import { Award, BookOpen, CheckCircle2, GraduationCap } from "lucide-react";

import { assertPortalEnabled } from "@/components/layout/shell-data";
import { Callout } from "@/components/shared/callout";
import { getOrgContext } from "@/modules/identity/authz";
import { requireUser } from "@/modules/identity/session";
import { INSTITUTION_KIND_LABELS, INSTITUTION_KINDS } from "@/modules/organizations/constants";
import { countryOptions, industryOptions } from "@/modules/taxonomy/queries";

import { InstitutionOnboardingForm } from "./onboarding-form";

export const metadata: Metadata = { title: "Set up your institution workspace", robots: { index: false } };

const STEPS = [
  { icon: GraduationCap, title: "Tell us about your institution", text: "Kind, recognition, address and an official contact." },
  { icon: CheckCircle2, title: "Get verified", text: "Upload registration and accreditation or affiliation documents. Venkat Sai reviews them." },
  { icon: BookOpen, title: "Run training and placements", text: "Publish courses, run batches, issue certificates and record placements." },
];

export default async function InstitutionOnboardingPage() {
  const user = await requireUser({ returnTo: "/institution/onboarding" });
  await assertPortalEnabled("institution");
  const [existing, countries, industries] = await Promise.all([getOrgContext("institution"), countryOptions(), industryOptions()]);
  const kindOptions = INSTITUTION_KINDS.map((k) => ({ value: k, label: INSTITUTION_KIND_LABELS[k] }));

  return (
    <div className="space-y-8">
      <div className="max-w-3xl space-y-3">
        <p className="text-sm font-medium text-teal-strong">Institution &amp; Training Portal</p>
        <h1 className="font-heading text-3xl font-bold tracking-tight text-navy sm:text-4xl">Set up your institution workspace</h1>
        <p id="onboarding-intro" className="text-base leading-7 text-muted-foreground">
          Colleges, universities, ITIs, training centres, assessment providers, technical institutes, corporate academies and internship providers can list
          courses, manage learners and connect them with verified employers on Venkat Sai Global.
        </p>
      </div>

      {existing ? (
        <Callout tone="info" title={`You already belong to ${existing.organization.name}`} action={{ label: "Go to your workspace", href: "/institution" }}>
          Only create another institution if you run a separate campus or legal entity. To join a colleague&apos;s institution, ask them to invite you from their
          team page.
        </Callout>
      ) : null}

      <ol className="grid gap-3 sm:grid-cols-3" aria-label="How it works">
        {STEPS.map((step, index) => (
          <li key={step.title} className="flex gap-3 rounded-xl border border-border bg-background p-4">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-teal-soft text-teal-strong" aria-hidden="true">
              <step.icon className="size-4" />
            </span>
            <div>
              <p className="text-sm font-semibold text-foreground">
                <span className="sr-only">Step {index + 1}: </span>
                {step.title}
              </p>
              <p className="mt-0.5 text-sm text-muted-foreground">{step.text}</p>
            </div>
          </li>
        ))}
      </ol>

      <Callout tone="neutral" icon={<Award className="size-4" aria-hidden="true" />} title="About certificates">
        Every verified institution can issue certificates of completion for its own courses. Accredited certificates under an external awarding body can be issued
        only after Venkat Sai has checked your accreditation and authorised you as a certificate issuer.
      </Callout>

      <section aria-labelledby="institution-form-heading" className="rounded-xl border border-border bg-background p-5 sm:p-8">
        <div className="mb-6">
          <h2 id="institution-form-heading" className="font-heading text-xl font-semibold text-navy">
            Institution details
          </h2>
          <p className="text-sm text-muted-foreground">Fields marked with an asterisk are required. Add the rest now or later before verification.</p>
        </div>
        <InstitutionOnboardingForm countries={countries} industries={industries} kindOptions={kindOptions} representativeName={user.displayName} />
      </section>
    </div>
  );
}
