import { PhoneCall, ShieldCheck, Workflow } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { InstallAppButton } from "@/components/public/install-app-button";
import { PageHero } from "@/components/public/page-hero";
import { CallButton, WhatsAppButton } from "@/components/public/requirements/contact-buttons";
import { buildPageMetadata, settle } from "@/components/public/server";
import { loadSharedFile } from "@/components/public/shared-file";
import { sp as pick, type SearchParams } from "@/lib/http";
import { listCountries } from "@/modules/taxonomy/queries";

import { RequirementConfirmation } from "./_components/requirement-confirmation";
import { RequirementPosterForm } from "./_components/requirement-poster-form";

export const metadata: Metadata = buildPageMetadata({
  title: "Post a requirement",
  description: "Hiring skilled workers? Send Venkat Sai Global your requirement poster. We call you, check it and then publish it on our website.",
  path: "/requirements/submit",
});

const ERRORS: Record<string, string> = {
  rate_limited: "You have sent several requirements in a short time. Please wait a little, or send the poster on WhatsApp.",
  invalid: "Your requirement could not be sent. Please check every required field and that the poster is a photo under 4 MB.",
};

/** Public "Post a requirement": a short form + poster photo; staff call and approve before anything is published. */
export default async function SubmitRequirementPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const sent = pick(sp, "sent");
  const error = pick(sp, "error");
  const [countries, shared] = await Promise.all([settle("countries", () => listCountries({ destinationsOnly: true }), []), loadSharedFile(pick(sp, "shared"))]);
  const sharedPoster = shared.file?.isImage ? shared.file : null;
  const sharedNotice = shared.expired
    ? "The file you shared has expired or was already used. Please choose the poster photo below."
    : shared.file && !sharedPoster
      ? "The file you shared is not a photo. Choose a photo or screenshot of the poster below, or send the document to us on WhatsApp."
      : null;
  const sentCode = sent && /^[A-Z0-9-]{1,40}$/.test(sent) && sent !== "1" ? sent : null;

  return (
    <>
      <PageHero
        eyebrow="Employers"
        title="Post a requirement"
        intro="Send us your requirement poster and contact details. We call you, check the details and then publish it. No account needed."
        breadcrumbs={[{ label: "Home", href: "/" }, { label: "Requirements", href: "/requirements" }, { label: "Post a requirement" }]}
        actions={
          <>
            <WhatsAppButton message="Hello Venkat Sai, I would like to post a job requirement." label="Send on WhatsApp" />
            <CallButton className="border border-white/30 bg-white/5 hover:bg-white/10" />
          </>
        }
      />
      <div className="container-page grid gap-10 py-10 sm:py-14 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,0.6fr)]">
        <div className="min-w-0">
          {sent ? (
            <RequirementConfirmation code={sentCode} companyName={null} />
          ) : (
            <>
              {error ? (
                <p role="alert" className="mb-5 rounded-xl border border-destructive/40 bg-danger-soft p-4 text-sm text-danger-strong">
                  {ERRORS[error] ?? ERRORS.invalid}
                </p>
              ) : null}
              {sharedNotice ? (
                <p role="status" className="mb-5 rounded-xl border border-border bg-surface-subtle p-4 text-sm text-foreground" data-testid="shared-notice">
                  {sharedNotice}
                </p>
              ) : null}
              <RequirementPosterForm countries={countries.map((c) => ({ value: c.code, label: c.name }))} shared={sharedPoster} />
            </>
          )}
        </div>
        <aside aria-label="What happens next" className="space-y-5">
          <h2 className="font-heading text-lg font-semibold text-navy">What happens next</h2>
          <ul className="space-y-4 text-sm leading-relaxed text-foreground">
            <li className="flex gap-3">
              <PhoneCall className="mt-0.5 size-5 shrink-0 text-navy" aria-hidden="true" />
              <span>Our team calls or WhatsApps you to confirm the trades, numbers and salary.</span>
            </li>
            <li className="flex gap-3">
              <Workflow className="mt-0.5 size-5 shrink-0 text-navy" aria-hidden="true" />
              <span>We publish the poster on our requirements page only after that check.</span>
            </li>
            <li className="flex gap-3">
              <ShieldCheck className="mt-0.5 size-5 shrink-0 text-navy" aria-hidden="true" />
              <span>Your phone number and email are never shown on the website. Candidates are never charged to apply.</span>
            </li>
          </ul>
          <p className="text-sm text-foreground">
            No poster, or a larger requirement?{" "}
            <Link href="/employers/request" className="font-medium text-teal-strong underline underline-offset-4">
              Use the detailed workforce requirement form
            </Link>
            .
          </p>
          <InstallAppButton />
        </aside>
      </div>
    </>
  );
}
