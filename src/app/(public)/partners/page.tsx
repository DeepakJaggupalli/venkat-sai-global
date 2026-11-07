import { BadgeCheck, FileSignature, Handshake, Scale } from "lucide-react";
import type { Metadata } from "next";

import { FeatureGrid } from "@/components/public/blocks";
import { EnquiryForm } from "@/components/public/forms/enquiry-form";
import { LandingPage, type LandingCopy } from "@/components/public/landing";
import { Section, SectionHeading } from "@/components/public/section";
import { buildPageMetadata } from "@/components/public/server";

export const metadata: Metadata = buildPageMetadata({
  title: "Become a recruitment partner",
  description: "Verified recruitment agencies work on Venkat Sai Global requirements through the Recruitment Partner Portal, with clear commercial terms and full candidate tracking.",
  path: "/partners",
});

const COPY: LandingCopy = {
  audience: "partners",
  faqAudience: "partners",
  breadcrumbs: [{ label: "Home", href: "/" }, { label: "Partners" }],
  eyebrow: "For recruitment partners",
  title: "Grow with a transparent recruitment network",
  intro:
    "Verified recruitment agencies and sourcing partners work on Venkat Sai requirements through their own portal — with terms agreed up front, candidate submissions and status tracking in one place.",
  primary: { label: "Become a recruitment partner", href: "/sign-up?intent=partner", id: "become_recruitment_partner" },
  secondary: { label: "Partner sign in", href: "/sign-in?returnTo=%2Frecruiter", id: "partner_sign_in" },
  benefits: {
    title: "Why partner with Venkat Sai",
    items: [
      { title: "Requirements assigned to you", description: "Receive the requirements Venkat Sai assigns to your agency, with role details, numbers and deadlines." },
      { title: "One place to submit candidates", description: "Submit candidates against a requirement and follow each one through screening, interview and offer." },
      { title: "Clear attribution", description: "Candidates you submit are attributed to your agency for the period set out in your agreement, so effort is recognised." },
      { title: "Terms you can see", description: "Your agreed commercial terms, invoices and payments are visible in your portal." },
      { title: "Messages and announcements", description: "Talk to the Venkat Sai team in context and receive partner announcements in your portal." },
      { title: "A trusted brand", description: "Work under the Venkat Sai Global brand with verified employers and transparent processes." },
    ],
  },
  eligible: {
    title: "Who can become a partner",
    intro: "We work with organisations that recruit ethically and can evidence their registrations.",
    items: [
      "Recruiting agents registered on eMigrate for overseas recruitment",
      "Domestic placement and staffing agencies",
      "Sourcing partners in India's skilled-trade regions",
      "Overseas recruitment and manpower companies",
      "Trade-test and assessment centres",
      "Community and skill-development organisations",
    ],
  },
  steps: {
    title: "Onboarding in four steps",
    items: [
      { title: "Create your partner account", description: "Sign up as a recruitment partner and tell us about your organisation." },
      { title: "Verification", description: "Upload your registration documents. Our team checks them before your account is activated." },
      { title: "Agreement", description: "Review and accept the partner agreement, including commercial terms and the candidate-fee policy." },
      { title: "Start working", description: "Receive assigned requirements, submit candidates and track every outcome." },
    ],
  },
  cta: {
    heading: "Ready to work together?",
    body: "Create your partner account and start verification. It takes a few minutes to begin.",
    primary: { label: "Become a recruitment partner", href: "/sign-up?intent=partner", id: "become_recruitment_partner" },
    secondary: { label: "Talk to our partnerships team", href: "#partner-enquiry", id: "partner_enquiry" },
  },
};

export default function PartnersPage() {
  return (
    <LandingPage copy={COPY}>
      <Section labelledBy="partners-compliance-title">
        <SectionHeading
          id="partners-compliance-title"
          eyebrow="Verification and compliance"
          title="Ethical recruitment is a condition of partnership"
          intro="These rules protect candidates, employers and every partner in the network."
        />
        <FeatureGrid
          className="mt-10"
          columns={2}
          items={[
            {
              title: "Registrations checked",
              description: "Overseas recruiting agents must hold a valid eMigrate registration; we record and verify the certificate number before you work on overseas requirements, and it is shown on the jobs you recruit for.",
            },
            { title: "Organisation documents", description: "Company registration, tax registration and the identity of an authorised signatory are verified during onboarding." },
            { title: "No fees from candidates", description: "Partners must not collect any payment from candidates for Venkat Sai requirements. Breaches lead to suspension." },
            { title: "Data protection", description: "Candidate data is shared only for the requirement it was submitted to, and partners never see other partners' candidates or terms." },
          ]}
        />
      </Section>
      <Section tone="subtle" labelledBy="partners-terms-title">
        <div className="grid gap-10 lg:grid-cols-2 lg:gap-16">
          <div>
            <SectionHeading
              id="partners-terms-title"
              eyebrow="Commercial terms"
              title="How partners are paid"
              intro="Commercial terms are agreed with each partner in writing before work starts. In outline:"
            />
            <ul className="mt-8 space-y-5">
              {[
                { icon: <FileSignature className="size-5" />, title: "Written agreement", text: "Fees, attribution period and payment terms are set out in your partner agreement and shown in your portal." },
                { icon: <Handshake className="size-5" />, title: "Paid on outcomes", text: "Fees relate to agreed outcomes on the requirements you work on — such as a candidate joining — as defined in your agreement." },
                { icon: <Scale className="size-5" />, title: "Transparent invoicing", text: "Invoices and payments are recorded in the portal with GST-compliant documents where applicable." },
                { icon: <BadgeCheck className="size-5" />, title: "Employer pays", text: "Recruitment is paid for by employers. Candidates are never charged." },
              ].map((item) => (
                <li key={item.title} className="flex gap-4">
                  <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-navy text-white">
                    {item.icon}
                  </span>
                  <div>
                    <h3 className="font-heading text-base font-semibold text-navy">{item.title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{item.text}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <div id="partner-enquiry" className="scroll-mt-24">
            <EnquiryForm type="partner" sourcePage="/partners" formId="partners_landing" heading="Partnership enquiry" defaultSubject="Recruitment partnership" intro="Questions before you apply? Our partnerships team will reply." />
          </div>
        </div>
      </Section>
    </LandingPage>
  );
}
