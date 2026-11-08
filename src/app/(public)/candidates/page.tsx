import { ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { LandingPage, type LandingCopy } from "@/components/public/landing";
import { SAFE_RECRUITMENT_PATH } from "@/components/public/links";
import { Section } from "@/components/public/section";
import { buildPageMetadata } from "@/components/public/server";

export const metadata: Metadata = buildPageMetadata({
  title: "For candidates",
  description: "Build one career profile to discover and apply for jobs, internships and training in India and overseas. Venkat Sai never charges candidates.",
  path: "/candidates",
});

const COPY: LandingCopy = {
  audience: "candidates",
  faqAudience: "candidates",
  breadcrumbs: [{ label: "Home", href: "/" }, { label: "Candidates" }],
  eyebrow: "For candidates",
  title: "Build your career profile. Open every door.",
  intro: "One profile for jobs, internships, training and skill assessments — in India and abroad. Applying through Venkat Sai Global is always free.",
  primary: { label: "Build your career profile", href: "/sign-up?intent=candidate", id: "build_career_profile" },
  secondary: { label: "Browse jobs", href: "/jobs", id: "explore_opportunities" },
  benefits: {
    title: "What your profile does for you",
    items: [
      { title: "Discover verified opportunities", description: "Search jobs and internships from verified employers and Venkat Sai-managed requirements, with salary and location shown wherever the employer shares them." },
      { title: "Apply in a few steps", description: "Your profile, documents and experience travel with every application, so you do not fill in the same details again." },
      { title: "Track every application", description: "See where each application stands, from submission to interview and offer, in one place." },
      { title: "Learn and qualify", description: "Join training programmes and Venkat Sai skill assessments to show employers what you can do." },
      { title: "Your language", description: "The People Portal works in English, Hindi and Telugu." },
      { title: "You control your data", description: "Choose who can see your profile and contact details, and request a copy or deletion of your data whenever you want." },
    ],
  },
  eligible: {
    title: "Opportunities for every stage of a career",
    intro: "Whether you are starting out or have years of experience in a trade, there is a place for you.",
    items: [
      "Skilled tradespeople such as welders, fitters and electricians",
      "Engineers, supervisors and technicians",
      "ITI, diploma and degree students",
      "Freshers looking for internships and apprenticeships",
      "Experienced professionals seeking overseas roles",
      "Anyone looking to train for a new skill",
    ],
  },
  steps: {
    title: "Four steps to your next opportunity",
    items: [
      { title: "Create your profile", description: "Sign up with your phone number or email and add your skills, experience and documents." },
      { title: "Discover and apply", description: "Search, save and apply for jobs, internships and training that match you." },
      { title: "Assessment and interview", description: "Some roles include a trade test or skill assessment — always free for candidates." },
      { title: "Offer and onboarding", description: "Receive your offer and, for overseas roles, documentation support and PDOT (Pre-Departure Orientation Training)." },
    ],
  },
  cta: {
    heading: "Your next opportunity starts with a profile",
    body: "It takes a few minutes and costs nothing — today or ever.",
    primary: { label: "Build your career profile", href: "/sign-up?intent=candidate", id: "build_career_profile" },
    secondary: { label: "Browse jobs", href: "/jobs", id: "explore_opportunities" },
  },
};

export default function CandidatesPage() {
  return (
    <LandingPage
      copy={COPY}
      afterSteps={
        <p className="mt-10 max-w-3xl text-sm leading-relaxed text-white/75">
          You must be 18 or older to create a full profile. Applicants under 18 need verifiable consent from a parent or guardian, and overseas roles are open only to adults.
        </p>
      }
    >
      <Section labelledBy="candidates-safety-title" className="py-12 sm:py-14 lg:py-16">
        <div className="flex flex-col gap-6 rounded-2xl border border-teal/40 bg-teal-soft p-6 sm:flex-row sm:items-center sm:p-8" data-testid="never-charge-notice">
          <span aria-hidden="true" className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-white text-teal-strong">
            <ShieldCheck className="size-7" />
          </span>
          <div className="flex-1">
            <h2 id="candidates-safety-title" className="font-heading text-xl font-semibold text-navy">
              We never charge candidates
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-foreground">
              Nobody should ask you for money to apply, be interviewed, be trade-tested or be placed through Venkat Sai. If anyone does, do not pay — report it to us. For overseas
              jobs, check that the recruiting agent is registered on the Government of India&apos;s eMigrate portal.
            </p>
          </div>
          <Link href={SAFE_RECRUITMENT_PATH} className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-full bg-foreground px-5 text-sm font-semibold text-white transition-colors hover:bg-[#26262b]">
            How to stay safe
          </Link>
        </div>
      </Section>
    </LandingPage>
  );
}
