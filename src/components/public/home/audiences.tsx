import { IMAGE_CREDITS } from "@/content/image-credits";

import { CheckList } from "../blocks";
import { CtaLink } from "../cta-link";
import { Section, SectionHeading } from "../section";
import { StockImage } from "../stock-image";

/**
 * "For employers / candidates / partners / institutions" homepage sections. The copy describes what the
 * platform does today (features, not results) — no figures, client names or promises.
 */

export type AudienceKey = "employers" | "candidates" | "partners" | "institutions";

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

const AUDIENCE_PHOTO: Record<AudienceKey, string> = {
  employers: "/images/stock/crew-2.webp",
  candidates: "/images/stock/welding-3.webp",
  partners: "/images/stock/crew-3.webp",
  institutions: "/images/stock/training-2.webp",
};

/**
 * The audience sections the CMS homepage switches on (partners, institutions), shown together as one calm row
 * of photo cards instead of one big section each. Copy describes features, never results.
 */
export function AudienceCards({ audiences, heading, intro, tone = "white" }: { audiences: readonly AudienceKey[]; heading?: string | null; intro?: string | null; tone?: "white" | "subtle" }) {
  if (!audiences.length) return null;
  return (
    <Section tone={tone} labelledBy="home-audiences-title" data-testid="home-audiences">
      <SectionHeading id="home-audiences-title" eyebrow="Work with us" title={heading || "Partners and institutions"} intro={intro || "Recruitment agencies, colleges and training institutes work with Venkat Sai through their own portals."} />
      <ul className={audiences.length > 1 ? "mt-12 grid gap-6 md:grid-cols-2" : "mt-12 grid max-w-2xl gap-6"}>
        {audiences.map((audience) => {
          const copy = AUDIENCE_COPY[audience];
          const photo = IMAGE_CREDITS.find((c) => c.src === AUDIENCE_PHOTO[audience]);
          return (
            <li key={audience} data-testid={`home-${audience}`}>
              <article className="card-surface flex h-full flex-col overflow-hidden rounded-3xl">
                {photo ? (
                  <div className="relative aspect-[16/9] bg-surface-subtle">
                    <StockImage photo={photo} decorative sizes="(min-width: 768px) 50vw, 100vw" />
                  </div>
                ) : null}
                <div className="flex flex-1 flex-col p-6 sm:p-8">
                  <p className="label-dot">{copy.eyebrow}</p>
                  <h3 className="mt-3 font-display text-2xl text-foreground sm:text-[1.75rem]">{copy.title}</h3>
                  <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">{copy.intro}</p>
                  <CheckList items={copy.points.slice(0, 3)} className="mt-6 text-[15px]" />
                  <div className="mt-auto pt-8">
                    <CtaLink href={copy.primary.href} cta={copy.primary.cta} location={`home_${audience}`} variant="outline" arrow>
                      {copy.primary.label}
                    </CtaLink>
                  </div>
                </div>
              </article>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
