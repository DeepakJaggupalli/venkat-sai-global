import { CheckList } from "../blocks";
import { CtaLink } from "../cta-link";
import { Section, SectionHeading } from "../section";
import { AudienceGlyph, BeadPattern, ReachMap } from "../visuals";

/**
 * "For employers / candidates / partners / institutions" homepage sections. The copy describes what the
 * platform does today (features, not results) — no figures, client names or promises.
 */

type AudienceKey = "employers" | "candidates" | "partners" | "institutions";

type AudienceCopy = {
  eyebrow: string;
  title: string;
  intro: string;
  points: string[];
  primary: { label: string; href: string; cta: string };
  secondary?: { label: string; href: string; cta: string };
};

export const AUDIENCE_COPY: Record<AudienceKey, AudienceCopy> = {
  employers: {
    eyebrow: "For employers",
    title: "Hire skilled people through one accountable partner",
    intro: "Tell us the roles, numbers and timelines. Venkat Sai sources, screens and coordinates candidates for projects in India and overseas, and you track every stage in the Employer Portal.",
    points: [
      "Bulk and project hiring with role-by-role requirements",
      "Trade tests and Venkat Sai skill assessments before selection",
      "Shortlists, interviews and offers managed in one portal",
      "Documentation and pre-departure coordination for overseas roles",
    ],
    primary: { label: "Submit your workforce requirement", href: "/employers/request", cta: "submit_workforce_requirement" },
    secondary: { label: "How hiring works", href: "/employers", cta: "employers_landing" },
  },
  candidates: {
    eyebrow: "For candidates",
    title: "One profile for jobs, training and growth",
    intro: "Build your career profile once and use it to discover verified jobs, internships and training — in India and abroad. Venkat Sai never charges candidates to apply or to be placed.",
    points: [
      "Search jobs and internships, save them and apply in a few steps",
      "Track every application and interview in one place",
      "Join training programmes and Venkat Sai skill assessments",
      "Available in English, Hindi and Telugu",
    ],
    primary: { label: "Build your career profile", href: "/sign-up", cta: "build_career_profile" },
    secondary: { label: "How it works for candidates", href: "/candidates", cta: "candidates_landing" },
  },
  partners: {
    eyebrow: "For recruitment partners",
    title: "Grow with a transparent recruitment network",
    intro: "Verified recruitment partners work on Venkat Sai requirements through their own portal, with clear commercial terms, candidate submissions and status tracking.",
    points: [
      "Access to requirements assigned to your agency",
      "Submit candidates and follow their progress",
      "Verification and compliance built into onboarding",
      "Commercial terms agreed up front and visible in your portal",
    ],
    primary: { label: "Become a recruitment partner", href: "/partners", cta: "become_recruitment_partner" },
  },
  institutions: {
    eyebrow: "For institutions",
    title: "Connect your students and trainees to industry",
    intro: "Colleges, ITIs and training institutes can publish courses, run campus drives and internships, and connect learners to employers through the Institution & Training Portal.",
    points: [
      "Publish courses and batches on the training catalogue",
      "Organise campus drives and internship programmes",
      "Record outcomes and issue verifiable certificates",
    ],
    primary: { label: "Partner as an institution", href: "/institutions", cta: "institutions_landing" },
  },
};

export function AudienceSection({ audience, heading, intro, tone = "white", reverse = false }: { audience: AudienceKey; heading?: string | null; intro?: string | null; tone?: "white" | "subtle"; reverse?: boolean }) {
  const copy = AUDIENCE_COPY[audience];
  const id = `home-${audience}-title`;
  return (
    <Section tone={tone} labelledBy={id} data-testid={`home-${audience}`}>
      <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
        <div className={reverse ? "lg:order-2" : undefined}>
          <SectionHeading id={id} eyebrow={copy.eyebrow} title={heading || copy.title} intro={intro || copy.intro} />
          <CheckList items={copy.points} className="mt-8" />
          <div className="mt-8 flex flex-wrap gap-3">
            <CtaLink href={copy.primary.href} cta={copy.primary.cta} location={`home_${audience}`} variant="primary" arrow>
              {copy.primary.label}
            </CtaLink>
            {copy.secondary ? (
              <CtaLink href={copy.secondary.href} cta={copy.secondary.cta} location={`home_${audience}`} variant="outline">
                {copy.secondary.label}
              </CtaLink>
            ) : null}
          </div>
        </div>
        <div className={reverse ? "lg:order-1" : undefined}>
          <AudiencePanel audience={audience} />
        </div>
      </div>
    </Section>
  );
}

/** Designed panel next to each audience section (no photos of people until real, consented media exists). */
function AudiencePanel({ audience }: { audience: AudienceKey }) {
  const steps: Record<AudienceKey, string[]> = {
    employers: ["Requirement received", "Sourcing and screening", "Trade test and interviews", "Offers and mobilisation"],
    candidates: ["Create your profile", "Discover and apply", "Assessment and interview", "Offer and onboarding"],
    partners: ["Apply and verify", "Agree terms", "Receive requirements", "Submit and track candidates"],
    institutions: ["Register your institution", "Publish courses and drives", "Connect learners to employers"],
  };
  return (
    <div className="relative isolate overflow-hidden rounded-3xl bg-navy-deep p-8 text-white shadow-xl sm:p-10">
      <BeadPattern />
      {audience === "employers" ? <ReachMap points={[]} showLabels={false} className="absolute inset-x-0 bottom-0 -z-10 opacity-60" /> : null}
      <div className="flex items-center gap-4">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-white">
          <AudienceGlyph variant={audience} className="size-10" />
        </span>
        <p className="font-heading text-lg font-semibold">{AUDIENCE_COPY[audience].eyebrow}</p>
      </div>
      <ol className="relative mt-8 space-y-5 border-l border-white/15 pl-6">
        {steps[audience].map((step, i) => (
          <li key={step} className="relative">
            <span aria-hidden="true" className="absolute top-1 -left-[1.92rem] flex size-4 items-center justify-center rounded-full border-2 border-teal bg-navy-deep">
              {i === steps[audience].length - 1 ? <span className="size-1.5 rounded-full bg-gold" /> : null}
            </span>
            <p className="text-sm text-white/60">Step {i + 1}</p>
            <p className="font-medium">{step}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}
