/**
 * Default funnel definitions (spec 13.2), seeded by seed.ts and identified by `key`. Pure data.
 *
 * Steps rely on these events being recorded by the owning modules (see README → "Events other modules
 * should emit"): registration_completed { intent }, organization_verification_submitted { orgType },
 * requirement_submitted, application_started, application_submitted. Page views are automatic.
 */
import type { AnalyticsFunnelStep } from "@/db/schema/analytics";

export type DefaultFunnel = { key: string; name: string; description: string; windowDays: number; steps: AnalyticsFunnelStep[] };

export const DEFAULT_FUNNEL_DEFINITIONS: readonly DefaultFunnel[] = [
  {
    key: "employer_journey",
    name: "Employer journey",
    description:
      "Visitor to first workforce requirement: homepage, employer services, employer registration, company verification, first requirement submitted.",
    windowDays: 30,
    steps: [
      { label: "Visitor", match: { event: "page_view" } },
      { label: "Homepage", match: { event: "page_view", path: "/" } },
      { label: "Employer services", match: { event: "page_view", path: "/employers*" } },
      { label: "Employer registration", match: { event: "registration_completed", props: { intent: "employer" } } },
      { label: "Company verification", match: { event: "organization_verification_submitted", props: { orgType: "employer" } } },
      { label: "First requirement submitted", match: { event: "requirement_submitted" } },
    ],
  },
  {
    key: "candidate_journey",
    name: "Candidate journey",
    description: "Visitor to completed application: jobs, job details, candidate registration, application started, application completed.",
    windowDays: 14,
    steps: [
      { label: "Visitor", match: { event: "page_view" } },
      { label: "Jobs", match: { event: "page_view", path: "/jobs" } },
      { label: "Job details", match: { event: "page_view", path: "/jobs/*" } },
      { label: "Candidate registration", match: { event: "registration_completed", props: { intent: "candidate" } } },
      { label: "Application started", match: { event: "application_started" } },
      { label: "Application completed", match: { event: "application_submitted" } },
    ],
  },
];
