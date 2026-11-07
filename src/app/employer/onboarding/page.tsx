import type { Metadata } from "next";
import { Building2, CheckCircle2, FileCheck2, Users } from "lucide-react";

import { assertPortalEnabled } from "@/components/layout/shell-data";
import { Callout } from "@/components/shared/callout";
import { getOrgContext } from "@/modules/identity/authz";
import { requireUser } from "@/modules/identity/session";
import { countryOptions, industryOptions } from "@/modules/taxonomy/queries";

import { EmployerOnboardingForm } from "./onboarding-form";

export const metadata: Metadata = { title: "Set up your employer workspace", robots: { index: false } };

const STEPS = [
  { icon: Building2, title: "Tell us about your company", text: "Registered details and an official contact." },
  { icon: FileCheck2, title: "Get verified", text: "Upload your registration documents. Venkat Sai reviews them." },
  { icon: Users, title: "Hire with your team", text: "Post jobs, send workforce requirements and invite colleagues." },
];

export default async function EmployerOnboardingPage() {
  const user = await requireUser({ returnTo: "/employer/onboarding" });
  await assertPortalEnabled("employer");
  const [existing, countries, industries] = await Promise.all([getOrgContext("employer"), countryOptions(), industryOptions()]);

  return (
    <div className="space-y-8">
      <div className="max-w-3xl space-y-3">
        <p className="text-sm font-medium text-teal-strong">Employer Portal</p>
        <h1 className="font-heading text-3xl font-bold tracking-tight text-navy sm:text-4xl">Set up your employer workspace</h1>
        <p id="onboarding-intro" className="text-base leading-7 text-muted-foreground">
          Register your company to post jobs, send workforce requirements and work with Venkat Sai&apos;s recruitment team. Candidates never pay to apply for
          your jobs.
        </p>
      </div>

      {existing ? (
        <Callout tone="info" title={`You already belong to ${existing.organization.name}`} action={{ label: "Go to your workspace", href: "/employer" }}>
          Only create another company if you hire for a separate business. To join a colleague&apos;s company, ask them to invite you from their team page.
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

      <section aria-labelledby="company-form-heading" className="rounded-xl border border-border bg-background p-5 sm:p-8">
        <div className="mb-6 flex items-start gap-3">
          <CheckCircle2 className="mt-1 size-5 shrink-0 text-teal" aria-hidden="true" />
          <div>
            <h2 id="company-form-heading" className="font-heading text-xl font-semibold text-navy">
              Company details
            </h2>
            <p className="text-sm text-muted-foreground">Fields marked with an asterisk are required. Add the rest now or later before verification.</p>
          </div>
        </div>
        <EmployerOnboardingForm countries={countries} industries={industries} representativeName={user.displayName} defaultEmail={undefined} />
      </section>
    </div>
  );
}
