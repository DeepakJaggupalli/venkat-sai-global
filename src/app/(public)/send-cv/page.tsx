import { Clock, FilePen, PhoneCall, ShieldCheck } from "lucide-react";
import Link from "next/link";
import type { Metadata } from "next";

import { PageHero } from "@/components/public/page-hero";
import { CallButton, WhatsAppButton } from "@/components/public/requirements/contact-buttons";
import { whatsappGroupUrlFrom } from "@/components/public/requirements/data";
import { buildPageMetadata, settle } from "@/components/public/server";
import { getSiteSettings } from "@/components/public/site-data";
import { sp as pick, type SearchParams } from "@/lib/http";
import { findRequirementPoster } from "@/modules/operations/cv-submissions";
import { listCountries, listJobCategories } from "@/modules/taxonomy/queries";

import { CvConfirmation } from "./_components/cv-confirmation";
import { SendCvForm } from "./_components/send-cv-form";

export const metadata: Metadata = buildPageMetadata({
  title: "Send your CV",
  description: "Send your CV and trade to Venkat Sai Global in two minutes, with no account. Our team will call you about suitable jobs abroad.",
  path: "/send-cv",
});

export default async function SendCvPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const requirementSlug = pick(sp, "requirement")?.toLowerCase();
  const sent = pick(sp, "sent");
  const error = pick(sp, "error");
  const [settings, categories, countries, requirement] = await Promise.all([
    getSiteSettings(),
    settle("job_categories", () => listJobCategories(), []),
    settle("countries", () => listCountries({ destinationsOnly: true }), []),
    requirementSlug && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(requirementSlug) ? settle("requirement_poster", () => findRequirementPoster(requirementSlug), null) : Promise.resolve(null),
  ]);
  const whatsappGroupUrl = whatsappGroupUrlFrom(settings);
  const sentCode = sent && /^[A-Z0-9-]{1,40}$/.test(sent) && sent !== "1" ? sent : null;

  return (
    <>
      <PageHero
        eyebrow="Jobs abroad"
        title="Send your CV and trade"
        intro="Tell us your trade and send your CV. No account needed. Our team will call you about suitable jobs. You can also send your CV on WhatsApp."
        breadcrumbs={[{ label: "Home", href: "/" }, { label: "Send your CV" }]}
        actions={
          <>
            <WhatsAppButton message="Hello Venkat Sai, I would like to send my CV." label="Send CV on WhatsApp" />
            <CallButton className="border border-white/30 bg-white/5 hover:bg-white/10" />
          </>
        }
      />
      <div className="container-page grid gap-10 py-10 sm:py-14 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,0.6fr)]">
        <div className="min-w-0">
          {sent ? (
            <CvConfirmation result={{ code: sentCode, name: "", trade: "", requirementTitle: null }} whatsappGroupUrl={whatsappGroupUrl} />
          ) : (
            <>
              {error ? (
                <p role="alert" className="mb-5 rounded-xl border border-destructive/40 bg-danger-soft p-4 text-sm text-danger-strong">
                  {error === "rate_limited"
                    ? "You have sent several CVs in a short time. Please wait a little, or send your CV on WhatsApp."
                    : "Your CV could not be sent. Please check every required field and that the CV is a PDF, Word file or photo under 4 MB."}
                </p>
              ) : null}
              <SendCvForm
                trades={categories.map((c) => ({ value: c.id, label: c.name }))}
                countries={countries.map((c) => ({ value: c.code, label: c.name }))}
                requirement={requirement ? { slug: requirement.slug, title: requirement.title } : null}
                whatsappGroupUrl={whatsappGroupUrl}
              />
            </>
          )}
        </div>
        <aside aria-label="What happens next" className="space-y-5">
          <h2 className="font-heading text-lg font-semibold text-navy">What happens next</h2>
          <ul className="space-y-4 text-sm leading-relaxed text-foreground">
            <li className="flex gap-3">
              <PhoneCall className="mt-0.5 size-5 shrink-0 text-navy" aria-hidden="true" />
              <span>Our team checks your trade and calls or WhatsApps you about matching requirements.</span>
            </li>
            <li className="flex gap-3">
              <Clock className="mt-0.5 size-5 shrink-0 text-navy" aria-hidden="true" />
              <span>Keep your passport and certificates ready. A trade test may be needed for some jobs.</span>
            </li>
            <li className="flex gap-3">
              <ShieldCheck className="mt-0.5 size-5 shrink-0 text-navy" aria-hidden="true" />
              <span>We never charge candidates to apply. Your CV is only seen by our recruitment team.</span>
            </li>
          </ul>
          <div className="rounded-xl border border-border bg-surface-subtle p-4">
            <h3 className="flex items-center gap-2 font-heading text-base font-semibold text-navy">
              <FilePen className="size-5 shrink-0" aria-hidden="true" />
              No proper CV yet?
            </h3>
            <p className="mt-1 text-sm text-foreground">We can prepare a professional resume for you in Word and PDF. This is an optional paid service, separate from any job application.</p>
            <Link href="/resume-service" className="mt-2 inline-flex min-h-10 items-center text-sm font-semibold text-navy underline underline-offset-4" data-testid="resume-service-link">
              Prepare my resume
            </Link>
          </div>
        </aside>
      </div>
    </>
  );
}
