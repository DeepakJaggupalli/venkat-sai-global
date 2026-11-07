import type { Metadata } from "next";
import { Building2, CheckCircle2, FileCheck2, Handshake, ShieldCheck } from "lucide-react";

import { assertPortalEnabled } from "@/components/layout/shell-data";
import { Callout } from "@/components/shared/callout";
import { getOrgContext } from "@/modules/identity/authz";
import { requireUser } from "@/modules/identity/session";
import { countryOptions, industryOptions } from "@/modules/taxonomy/queries";

import { PartnerOnboardingForm } from "./onboarding-form";

export const metadata: Metadata = { title: "Become a recruitment partner", robots: { index: false } };

const STEPS = [
  { icon: Building2, title: "Agency details", text: "Registered entity, address, services and territories." },
  { icon: ShieldCheck, title: "Licences", text: "Recruiting Agent registration or your foreign licence, with expiry." },
  { icon: FileCheck2, title: "Documents", text: "Registration certificate and supporting records." },
  { icon: Handshake, title: "Agreement and verification", text: "Accept the partner agreement. Venkat Sai verifies your agency." },
];

export default async function PartnerOnboardingPage() {
  const user = await requireUser({ returnTo: "/recruiter/onboarding" });
  await assertPortalEnabled("recruiter");
  const [existing, countries, industries] = await Promise.all([getOrgContext("recruitment_partner"), countryOptions(), industryOptions()]);

  return (
    <div className="space-y-8">
      <div className="max-w-3xl space-y-3">
        <p className="text-sm font-medium text-teal-strong">Recruitment Partner Portal</p>
        <h1 className="font-heading text-3xl font-bold tracking-tight text-navy sm:text-4xl">Become a Venkat Sai recruitment partner</h1>
        <p id="onboarding-intro" className="text-base leading-7 text-muted-foreground">
          Register your agency to receive requirements assigned by Venkat Sai, submit consenting candidates and track interviews, placements and settlements. Partner
          agencies are verified before they can submit candidates, and candidates are never charged.
        </p>
      </div>

      {existing ? (
        <Callout tone="info" title={`You already belong to ${existing.organization.name}`} action={{ label: "Go to your workspace", href: "/recruiter" }}>
          Only register another agency if it is a separate legal entity. To join a colleague&apos;s agency, ask them to invite you from their team page.
        </Callout>
      ) : null}

      <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="How partner registration works">
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

      <Callout tone="brand" title="Recruiting for jobs abroad?">
        Agencies that recruit workers for employment outside their home country need an active recruitment licence. Agencies based in or sourcing from India need a
        Recruiting Agent registration under the Emigration Act 1983 (eMigrate). You will add it in the next step; Venkat Sai verifies it before approving your agency.
      </Callout>

      <section aria-labelledby="agency-form-heading" className="rounded-xl border border-border bg-background p-5 sm:p-8">
        <div className="mb-6 flex items-start gap-3">
          <CheckCircle2 className="mt-1 size-5 shrink-0 text-teal" aria-hidden="true" />
          <div>
            <h2 id="agency-form-heading" className="font-heading text-xl font-semibold text-navy">
              Agency details
            </h2>
            <p className="text-sm text-muted-foreground">Fields marked with an asterisk are required. You can complete the rest from your agency profile before verification.</p>
          </div>
        </div>
        <PartnerOnboardingForm countries={countries} industries={industries} representativeName={user.displayName} />
      </section>
    </div>
  );
}
