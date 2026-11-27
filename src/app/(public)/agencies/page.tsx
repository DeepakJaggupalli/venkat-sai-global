import type { Metadata } from "next";

import { ManpowerSection } from "@/components/public/home/manpower";
import { LandingPage, type LandingCopy } from "@/components/public/landing";
import { buildPageMetadata } from "@/components/public/server";

export const metadata: Metadata = buildPageMetadata({
  title: "For travel agencies",
  description:
    "Travel agencies send Venkat Sai Global the manpower requirements they receive from abroad. We source and trade-test the workers, and you follow every candidate and deployment in the Travel Agency Portal.",
  path: "/agencies",
});

const PRIMARY = { label: "Open a Travel Agency account", href: "/sign-up?intent=travel_agency", id: "travel_agency_signup" };

const COPY: LandingCopy = {
  audience: "agencies",
  faqAudience: "agencies",
  breadcrumbs: [{ label: "Home", href: "/" }, { label: "Travel agencies" }],
  eyebrow: "For travel agencies",
  title: "Got a requirement from abroad? We supply the workers",
  intro:
    "Send us the manpower requirements your clients abroad give you. Venkat Sai sources and trade-tests the people, and you follow every candidate, interview and deployment in your own Travel Agency Portal.",
  primary: PRIMARY,
  secondary: { label: "Travel agency sign in", href: "/sign-in?returnTo=%2Fagency", id: "travel_agency_sign_in" },
  highlights: ["Send requirements from your overseas clients", "Workers screened and trade-tested", "Track deployment in one portal"],
  benefits: {
    title: "Why travel agencies work with Venkat Sai",
    items: [
      { title: "Send any requirement", description: "Trades, number of people, salary, location and the demand letter: everything in one requirement form." },
      { title: "Trade-tested people", description: "We source candidates and arrange trade tests, so the workers you put forward can do the job." },
      { title: "One pipeline to follow", description: "See every candidate we put forward and move them through the stages with your team." },
      { title: "Visa and travel tracking", description: "Follow offers, documents, visa and travel for each selected worker until deployment." },
      { title: "Everything visible", description: "Messages, invoices and the status of every requirement are in your portal, any time." },
      { title: "Fair to workers", description: "Candidates are never charged a placement fee. That protects them and your agency's name." },
    ],
  },
  eligible: {
    title: "Who this is for",
    intro: "Agencies that receive manpower requirements from employers outside India, or arrange their travel.",
    items: [
      "Travel agencies with clients abroad",
      "Overseas manpower and visa agents",
      "Agencies with demand letters from Gulf employers",
      "Agencies that arrange worker visas and tickets",
      "Agents for project companies abroad",
      "Agencies looking for a reliable supply partner",
    ],
  },
  steps: {
    title: "From requirement to deployment",
    items: [
      { title: "Open your agency account", description: "Sign up as a travel agency and add your agency details. It takes a few minutes." },
      { title: "Get verified", description: "Upload your registration documents. Our team checks them and unlocks every feature." },
      { title: "Send a requirement", description: "Add the trades, number of people, salary and the demand letter from your client." },
      { title: "Review and deploy", description: "Review the candidates we put forward, run client interviews and track visa and travel." },
    ],
  },
  cta: {
    heading: "Send your first requirement",
    body: "Open your Travel Agency account, or message our business team on WhatsApp for big requirements.",
    primary: PRIMARY,
    secondary: { label: "Submit a requirement without an account", href: "/employers/request", id: "agency_requirement_form" },
  },
  labels: { tourTitle: "Take a quick tour of the Travel Agency Portal" },
};

export default function AgenciesPage() {
  return (
    <LandingPage copy={COPY}>
      <ManpowerSection tone="subtle" />
    </LandingPage>
  );
}
