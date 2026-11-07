import { Building2, Users } from "lucide-react";
import type { Metadata } from "next";

import { EnquiryForm } from "@/components/public/forms/enquiry-form";
import { LandingPage, type LandingCopy } from "@/components/public/landing";
import { CtaLink } from "@/components/public/cta-link";
import { Section, SectionHeading } from "@/components/public/section";
import { buildPageMetadata } from "@/components/public/server";
import { REQUIREMENT_KIND_LABELS } from "@/modules/operations/constants";

export const metadata: Metadata = buildPageMetadata({
  title: "Hire through Venkat Sai",
  description: "Bulk, project, contract and overseas hiring through Venkat Sai Global: sourcing, screening, trade testing and mobilisation managed in one Employer Portal.",
  path: "/employers",
});

const COPY: LandingCopy = {
  audience: "employers",
  faqAudience: "employers",
  breadcrumbs: [{ label: "Home", href: "/" }, { label: "Employers" }],
  eyebrow: "For employers",
  title: "Hire skilled people through one accountable partner",
  intro:
    "Share the roles, numbers and timelines. Venkat Sai sources, screens and trade-tests candidates for projects in India and overseas, and you follow every stage in the Employer Portal.",
  primary: { label: "Submit your workforce requirement", href: "/employers/request", id: "submit_workforce_requirement" },
  secondary: { label: "Create an employer account", href: "/sign-up?intent=employer", id: "employer_signup" },
  benefits: {
    title: "Everything hiring needs, in one place",
    items: [
      { title: "Requirement-led sourcing", description: "Describe each role line by line — trade, positions, experience, salary and location — and we plan sourcing around it." },
      { title: "Skill checks before selection", description: "Trade tests and Venkat Sai skill assessments can be arranged before interviews, so you meet candidates who can do the work." },
      { title: "One portal for the pipeline", description: "Post jobs, review shortlists, schedule interviews and record offers in the Employer Portal with your team." },
      { title: "Overseas mobilisation support", description: "Documentation tracking and PDOT (Pre-Departure Orientation Training) coordination for candidates travelling abroad." },
      { title: "Verified organisations", description: "Employers are verified before jobs go live, which protects candidates and the reputation of every employer on the platform." },
      { title: "Fair to candidates", description: "Employers pay for recruitment services. Candidates are never charged to apply, be interviewed or be trade-tested." },
    ],
  },
  steps: {
    title: "From requirement to joining",
    items: [
      { title: "Share your requirement", description: "Use the requirement form or your Employer Portal. You receive a reference number straight away." },
      { title: "Agree the plan", description: "Our team confirms roles, terms, selection method and timelines with you." },
      { title: "Sourcing and screening", description: "We source candidates, check profiles and arrange trade tests where needed." },
      { title: "Interviews, offers and joining", description: "You interview and select; we coordinate offers, documentation and mobilisation." },
    ],
  },
  cta: {
    heading: "Tell us what you need",
    body: "Submit a workforce requirement in a few minutes. No account is needed to get started.",
    primary: { label: "Submit your workforce requirement", href: "/employers/request", id: "submit_workforce_requirement" },
    secondary: { label: "Sign in to the Employer Portal", href: "/sign-in?returnTo=%2Femployer", id: "employer_sign_in" },
  },
};

const MODELS = (Object.keys(REQUIREMENT_KIND_LABELS) as (keyof typeof REQUIREMENT_KIND_LABELS)[]).map((key) => REQUIREMENT_KIND_LABELS[key]);

export default function EmployersPage() {
  return (
    <LandingPage copy={COPY}>
      <Section labelledBy="employers-models-title">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16">
          <div>
            <SectionHeading
              id="employers-models-title"
              eyebrow="Hiring models"
              title="However you need to hire"
              intro="Choose the model that fits the work. One requirement can include many roles."
            />
            <div className="mt-8 flex flex-wrap gap-3">
              <CtaLink href="/employers/request" cta="submit_workforce_requirement" location="employers_models" variant="primary" arrow>
                Submit your workforce requirement
              </CtaLink>
            </div>
          </div>
          <ul className="grid content-start gap-3 sm:grid-cols-2">
            {MODELS.map((label) => (
              <li key={label} className="flex items-center gap-3 rounded-xl border border-border bg-white px-4 py-3.5">
                <span aria-hidden="true" className="flex size-9 items-center justify-center rounded-lg bg-teal-soft text-teal-strong">
                  {label.toLowerCase().includes("individual") ? <Users className="size-4" /> : <Building2 className="size-4" />}
                </span>
                <span className="font-medium text-navy">{label}</span>
              </li>
            ))}
          </ul>
        </div>
      </Section>
      <Section tone="subtle" labelledBy="employers-enquiry-title">
        <div className="grid gap-10 lg:grid-cols-2 lg:gap-16">
          <SectionHeading
            id="employers-enquiry-title"
            eyebrow="Talk to us"
            title="Have a question first?"
            intro="Ask about services, commercial terms or a specific project. If you already know the roles you need, the requirement form is the fastest route."
          />
          <EnquiryForm type="employer" sourcePage="/employers" formId="employers_landing" heading="Employer enquiry" defaultSubject="Hiring enquiry" />
        </div>
      </Section>
    </LandingPage>
  );
}
