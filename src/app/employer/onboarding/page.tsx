import type { Metadata } from "next";
import { Building2, CheckCircle2, FileCheck2, Users } from "lucide-react";
import Link from "next/link";

import { requestedEmployerPortal } from "@/components/layout/employer-portal";
import { assertPortalEnabled } from "@/components/layout/shell-data";
import { Callout } from "@/components/shared/callout";
import { PORTAL_LABEL } from "@/config/navigation";
import { getOrgContext } from "@/modules/identity/authz";
import { requireUser } from "@/modules/identity/session";
import { employerKindOf, employerOnboardingPath, employerPortalHome, type EmployerKind } from "@/modules/organizations/employer-kind";
import { countryOptions, industryOptions } from "@/modules/taxonomy/queries";

import { EmployerOnboardingForm } from "./onboarding-form";

export async function generateMetadata(): Promise<Metadata> {
  const agency = (await requestedEmployerPortal()) === "agency";
  return { title: agency ? "Set up your travel agency workspace" : "Set up your employer workspace", robots: { index: false } };
}

const COPY: Record<EmployerKind, { portal: string; title: string; intro: string; formTitle: string; steps: { title: string; text: string }[] }> = {
  direct_company: {
    portal: PORTAL_LABEL.employer,
    title: "Set up your employer workspace",
    intro:
      "Register your company to post jobs, send workforce requirements and work with Venkat Sai's recruitment team. Candidates never pay to apply for your jobs.",
    formTitle: "Company details",
    steps: [
      { title: "Tell us about your company", text: "Registered details and an official contact." },
      { title: "Get verified", text: "Upload your registration documents. Venkat Sai reviews them." },
      { title: "Hire with your team", text: "Post jobs, send workforce requirements and invite colleagues." },
    ],
  },
  travel_agency: {
    portal: PORTAL_LABEL.agency,
    title: "Set up your travel agency workspace",
    intro:
      "Register your agency to send the manpower requirements you receive from abroad. Venkat Sai sources, trade-tests and mobilises the workers, and you follow every candidate here. Candidates never pay to apply.",
    formTitle: "Agency details",
    steps: [
      { title: "Tell us about your agency", text: "Registered details and an official contact." },
      { title: "Get verified", text: "Upload your registration and licence documents. Venkat Sai reviews them." },
      { title: "Send requirements", text: "Share manpower requirements and follow interviews and mobilisation." },
    ],
  },
};

const STEP_ICONS = [Building2, FileCheck2, Users];

/**
 * Employer onboarding for both employer portals: /employer/onboarding creates a direct company (Company Portal) and
 * /agency/onboarding (rewritten here by src/proxy.ts) creates a travel agency (Travel Agency Portal). The kind is fixed
 * by the page; owners can change it later from the company / agency profile.
 */
export default async function EmployerOnboardingPage() {
  const kind: EmployerKind = (await requestedEmployerPortal()) === "agency" ? "travel_agency" : "direct_company";
  const otherKind: EmployerKind = kind === "travel_agency" ? "direct_company" : "travel_agency";
  const user = await requireUser({ returnTo: employerOnboardingPath(kind) });
  await assertPortalEnabled("employer");
  const [existing, countries, industries] = await Promise.all([getOrgContext("employer"), countryOptions(), industryOptions()]);
  const copy = COPY[kind];
  const existingHome = existing ? employerPortalHome(employerKindOf(existing.organization) ?? "direct_company") : null;

  return (
    <div className="space-y-8">
      <div className="max-w-3xl space-y-3">
        <p className="text-sm font-medium text-teal-strong">{copy.portal}</p>
        <h1 className="font-heading text-3xl font-bold tracking-tight text-navy sm:text-4xl">{copy.title}</h1>
        <p id="onboarding-intro" className="text-base leading-7 text-muted-foreground">
          {copy.intro}
        </p>
        <p className="text-sm text-muted-foreground">
          {kind === "travel_agency" ? "Registering a company or HR team instead? " : "Are you a travel agency with requirements from abroad? "}
          <Link href={employerOnboardingPath(otherKind)} className="font-medium text-teal-strong underline-offset-4 hover:underline">
            {kind === "travel_agency" ? "Set up a company workspace" : "Set up a travel agency workspace"}
          </Link>
        </p>
      </div>

      {existing && existingHome ? (
        <Callout tone="info" title={`You already belong to ${existing.organization.name}`} action={{ label: "Go to your workspace", href: existingHome }}>
          Only create another workspace if you work for a separate business. To join a colleague&apos;s workspace, ask them to invite you from their team page.
        </Callout>
      ) : null}

      <ol className="grid gap-3 sm:grid-cols-3" aria-label="How it works">
        {copy.steps.map((step, index) => {
          const Icon = STEP_ICONS[index] ?? Building2;
          return (
            <li key={step.title} className="flex gap-3 rounded-xl border border-border bg-background p-4">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-teal-soft text-teal-strong" aria-hidden="true">
                <Icon className="size-4" />
              </span>
              <div>
                <p className="text-sm font-semibold text-foreground">
                  <span className="sr-only">Step {index + 1}: </span>
                  {step.title}
                </p>
                <p className="mt-0.5 text-sm text-muted-foreground">{step.text}</p>
              </div>
            </li>
          );
        })}
      </ol>

      <section aria-labelledby="company-form-heading" className="rounded-xl border border-border bg-background p-5 sm:p-8">
        <div className="mb-6 flex items-start gap-3">
          <CheckCircle2 className="mt-1 size-5 shrink-0 text-teal" aria-hidden="true" />
          <div>
            <h2 id="company-form-heading" className="font-heading text-xl font-semibold text-navy">
              {copy.formTitle}
            </h2>
            <p className="text-sm text-muted-foreground">Fields marked with an asterisk are required. Add the rest now or later before verification.</p>
          </div>
        </div>
        <EmployerOnboardingForm employerKind={kind} countries={countries} industries={industries} representativeName={user.displayName} defaultEmail={undefined} />
      </section>
    </div>
  );
}
