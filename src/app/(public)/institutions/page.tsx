import type { Metadata } from "next";

import { EnquiryForm } from "@/components/public/forms/enquiry-form";
import { LandingPage, type LandingCopy } from "@/components/public/landing";
import { Section, SectionHeading } from "@/components/public/section";
import { buildPageMetadata } from "@/components/public/server";

export const metadata: Metadata = buildPageMetadata({
  title: "For institutions",
  description: "Colleges, ITIs and training institutes can publish courses, run campus drives and internships, and connect learners to employers through Venkat Sai Global.",
  path: "/institutions",
});

const COPY: LandingCopy = {
  audience: "institutions",
  faqAudience: "institutions",
  breadcrumbs: [{ label: "Home", href: "/" }, { label: "Institutions" }],
  eyebrow: "For institutions",
  title: "Connect your learners to industry",
  intro:
    "Colleges, ITIs, polytechnics and training institutes can publish courses, run campus drives and internship programmes, and help learners move into work through the Institution & Training Portal.",
  primary: { label: "Partner as an institution", href: "/sign-up?intent=institution", id: "institution_signup" },
  secondary: { label: "Institution sign in", href: "/sign-in?returnTo=%2Finstitution", id: "institution_sign_in" },
  benefits: {
    title: "What the Institution & Training Portal offers",
    items: [
      { title: "Publish courses and batches", description: "List your programmes on the public training catalogue after a quality review, with batch dates, fees and seats." },
      { title: "Campus drives", description: "Plan campus recruitment drives with verified employers and invite your students to apply." },
      { title: "Internship programmes", description: "Offer internships and apprenticeships and track applications and outcomes." },
      { title: "Verifiable certificates", description: "Issue certificates that anyone can check on the public verification page." },
      { title: "Outcomes you can evidence", description: "Record placement outcomes against evidence so the figures you share are accurate." },
      { title: "Your brand, our network", description: "Your institution profile appears under the Venkat Sai Global brand, connected to employers and candidates." },
    ],
  },
  eligible: {
    title: "Who can join",
    items: [
      "Engineering and degree colleges",
      "ITIs and polytechnics",
      "Skill-development and training centres",
      "Welding and trade-testing institutes",
      "Language and pre-departure training providers",
      "Universities and placement cells",
    ],
  },
  steps: {
    title: "Getting started",
    items: [
      { title: "Register your institution", description: "Create an institution account and add your profile." },
      { title: "Verification", description: "Share your registration or affiliation documents for review." },
      { title: "Publish", description: "Add courses, batches, drives and internships — each reviewed before it goes live." },
      { title: "Connect learners to work", description: "Invite learners, issue certificates and record outcomes." },
    ],
  },
  cta: {
    heading: "Bring your institution onto the network",
    body: "Registration is quick, and our team will help you through verification.",
    primary: { label: "Partner as an institution", href: "/sign-up?intent=institution", id: "institution_signup" },
    secondary: { label: "Browse the training catalogue", href: "/training", id: "training_catalogue" },
  },
};

export default function InstitutionsPage() {
  return (
    <LandingPage copy={COPY}>
      <Section labelledBy="institutions-enquiry-title">
        <div className="grid gap-10 lg:grid-cols-2 lg:gap-16">
          <SectionHeading
            id="institutions-enquiry-title"
            eyebrow="Talk to us"
            title="Questions about partnering?"
            intro="Tell us about your institution and what you would like to offer your learners. Our team will reply."
          />
          <EnquiryForm type="institution" sourcePage="/institutions" formId="institutions_landing" heading="Institution enquiry" defaultSubject="Institution partnership" />
        </div>
      </Section>
    </LandingPage>
  );
}
