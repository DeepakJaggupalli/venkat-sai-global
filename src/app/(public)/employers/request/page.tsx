import { Building2, Clock, FileCheck2, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Callout } from "@/components/shared/callout";
import { CtaLink } from "@/components/public/cta-link";
import { RequirementForm, type RequirementFormOptions } from "@/components/public/forms/requirement-form";
import { PageHero } from "@/components/public/page-hero";
import { buildPageMetadata, settle } from "@/components/public/server";
import { sp, type SearchParams } from "@/lib/http";
import { getOrgContext } from "@/modules/identity/authz";
import { REQUIREMENT_INTERVIEW_METHOD_LABELS, REQUIREMENT_KIND_LABELS, REQUIREMENT_URGENCY_LABELS } from "@/modules/operations/constants";
import { countryOptions, currencyOptions, industryOptions } from "@/modules/taxonomy/queries";

export const metadata: Metadata = buildPageMetadata({
  title: "Submit a workforce requirement",
  description: "Tell Venkat Sai Global the roles, numbers and timelines you need. We plan sourcing, screening and trade testing with you. No account needed.",
  path: "/employers/request",
});

type Props = { searchParams: Promise<SearchParams> };

const UTM_KEYS = ["source", "medium", "campaign", "term", "content"] as const;

function labelled<T extends Record<string, string>>(labels: T) {
  return Object.entries(labels).map(([value, label]) => ({ value, label }));
}

export default async function RequirementRequestPage({ searchParams }: Props) {
  const params = await searchParams;
  // Public form: no authorisation required. Signed-in employer members are offered their portal, where the
  // requirement is linked to their organisation and tracked (they can still use this form with ?guest=1).
  const employer = await settle("employer.context", () => getOrgContext("employer"), null);
  const asGuest = sp(params, "guest") === "1";

  const [countries, industries, currencies] = await Promise.all([
    settle("countries", () => countryOptions(), []),
    settle("industries", () => industryOptions(), []),
    settle("currencies", () => currencyOptions(), []),
  ]);
  const options: RequirementFormOptions = {
    countries,
    industries,
    currencies,
    kinds: labelled(REQUIREMENT_KIND_LABELS),
    urgencies: labelled(REQUIREMENT_URGENCY_LABELS),
    interviewMethods: labelled(REQUIREMENT_INTERVIEW_METHOD_LABELS),
  };
  const utm: Record<string, string> = {};
  for (const key of UTM_KEYS) {
    const value = sp(params, `utm_${key}`);
    if (value) utm[key] = value.slice(0, 200);
  }

  return (
    <>
      <PageHero
        breadcrumbs={[{ label: "Home", href: "/" }, { label: "Employers", href: "/employers" }, { label: "Submit a requirement" }]}
        eyebrow="For employers"
        title="Submit your workforce requirement"
        intro="Tell us the roles, numbers and timelines. Our team reviews every requirement and contacts you to agree the plan. No account is needed."
      />
      <div className="bg-surface-subtle">
        <div className="container-page grid gap-10 py-12 sm:py-16 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-12">
          <div className="min-w-0">
            {employer && !asGuest ? (
              <div className="space-y-6" data-testid="employer-portal-offer">
                <Callout tone="brand" icon={<Building2 aria-hidden="true" className="size-5" />} title={`You are signed in as a member of ${employer.organization.name}`}>
                  <p>Submit the requirement from your Employer Portal so it is linked to your organisation and you can follow every update there.</p>
                </Callout>
                <div className="flex flex-wrap gap-3">
                  <CtaLink href="/employer/requirements" cta="employer_portal_requirements" location="requirement_request" variant="primary" arrow>
                    Go to workforce requirements
                  </CtaLink>
                  <Link href="/employers/request?guest=1" className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold text-teal-strong underline-offset-4 hover:underline">
                    Use the public form instead
                  </Link>
                </div>
              </div>
            ) : (
              <RequirementForm options={options} utm={utm} />
            )}
          </div>
          <aside className="space-y-5 lg:sticky lg:top-28 lg:self-start" aria-label="About this form">
            <div className="rounded-2xl border border-border bg-white p-6">
              <h2 className="font-heading text-lg font-semibold text-navy">What to expect</h2>
              <ul className="mt-4 space-y-4 text-sm leading-relaxed text-muted-foreground">
                <li className="flex gap-3">
                  <FileCheck2 aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-teal-strong" />
                  <span>You receive a reference number as soon as you submit, and an acknowledgement by email or SMS.</span>
                </li>
                <li className="flex gap-3">
                  <Clock aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-teal-strong" />
                  <span>Our team reviews the requirement and contacts you to confirm roles, terms and timelines.</span>
                </li>
                <li className="flex gap-3">
                  <ShieldCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-teal-strong" />
                  <span>Employers pay for recruitment services. Candidates are never charged to apply, be interviewed or be trade-tested.</span>
                </li>
              </ul>
            </div>
            <div className="rounded-2xl border border-border bg-white p-6 text-sm text-muted-foreground">
              <p>
                Already work with us?{" "}
                <Link href="/sign-in?returnTo=%2Femployer%2Frequirements" className="font-semibold text-teal-strong underline underline-offset-4">
                  Sign in to the Employer Portal
                </Link>{" "}
                to submit and track requirements.
              </p>
            </div>
          </aside>
        </div>
      </div>
    </>
  );
}
