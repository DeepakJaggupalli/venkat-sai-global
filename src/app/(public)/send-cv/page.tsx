import { Clock, FilePen, PhoneCall, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";

import { InstallAppButton } from "@/components/public/install-app-button";
import { PageHero } from "@/components/public/page-hero";
import { CallButton, WhatsAppButton } from "@/components/public/requirements/contact-buttons";
import { loadPoster, whatsappGroupUrlFrom } from "@/components/public/requirements/data";
import { buildPageMetadata, settle } from "@/components/public/server";
import { loadSharedFile } from "@/components/public/shared-file";
import { getSiteSettings } from "@/components/public/site-data";
import { sp as pick, type SearchParams } from "@/lib/http";
import { getFilePolicy } from "@/modules/files/policies";
import { getCurrentUser } from "@/modules/identity/session";
import { CV_REFERRAL_COOKIE, normaliseReferralCode, posterTradeOptions } from "@/modules/operations/cv-submission-schemas";
import { listCountries, listJobCategories } from "@/modules/taxonomy/queries";

import { CvConfirmation } from "./_components/cv-confirmation";
import { SendCvForm } from "./_components/send-cv-form";

export const metadata: Metadata = buildPageMetadata({
  title: "Apply for jobs abroad",
  description: "Apply to Venkat Sai Global in one minute: your name, mobile number and trade. Add your CV now or send it later on WhatsApp. No account needed.",
  path: "/send-cv",
});

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * Quick apply ("Send your CV"). Only name, mobile number and trade are required; the CV is optional. From a poster
 * (?requirement=<slug>) the requirement is shown and its trades come first in the trade picker. A referral code
 * (?ref=CODE, else the cookie set by /r/CODE) travels as a hidden field. Signed-in candidates get their name, email
 * and phone filled in (never for staff accounts, who may be applying for a walk-in worker).
 */
export default async function SendCvPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const requirementSlug = pick(sp, "requirement")?.toLowerCase();
  const sent = pick(sp, "sent");
  const error = pick(sp, "error");
  const [settings, categories, countries, poster, shared, user, cookieStore] = await Promise.all([
    getSiteSettings(),
    settle("job_categories", () => listJobCategories(), []),
    settle("countries", () => listCountries({ destinationsOnly: true }), []),
    requirementSlug && SLUG.test(requirementSlug) ? settle("requirement_poster", () => loadPoster(requirementSlug, null), null) : Promise.resolve(null),
    loadSharedFile(pick(sp, "shared")),
    settle("current_user", () => getCurrentUser(), null),
    cookies(),
  ]);
  // A file shared from the phone (/share/choose → "Send as my CV"), when its type is accepted for CVs.
  const sharedUsable = shared.file && (getFilePolicy("cv_submission").allowedMimeTypes as readonly string[]).includes(shared.file.mimeType) ? shared.file : null;
  const sharedNotice = shared.expired
    ? "The file you shared has expired or was already sent. Choose your CV below, or apply without it."
    : shared.file && !sharedUsable
      ? "The file you shared cannot be sent as a CV. Choose a PDF, Word file, JPG or PNG below, or apply without it."
      : null;
  const whatsappGroupUrl = whatsappGroupUrlFrom(settings);
  const sentCode = sent && /^[A-Z0-9-]{1,40}$/.test(sent) && sent !== "1" ? sent : null;
  const trades = categories.map((c) => ({ value: c.id, label: c.name }));
  const requirement = poster ? { slug: poster.card.slug, title: poster.card.title, countryName: poster.card.countryName } : null;
  const referralCode = normaliseReferralCode(pick(sp, "ref")) ?? normaliseReferralCode(cookieStore.get(CV_REFERRAL_COOKIE)?.value);
  const defaults = user && !user.isStaff ? { name: user.displayName, email: user.email ?? undefined, phone: user.phone ?? undefined } : {};

  return (
    <>
      <PageHero
        eyebrow={requirement ? "Apply for this job" : "Jobs abroad"}
        title={requirement ? "Apply now" : "Apply for jobs abroad"}
        intro="Only your name, mobile number and trade are needed. Add your CV now, or send it later on WhatsApp. No account needed."
        breadcrumbs={[{ label: "Home", href: "/" }, ...(requirement ? [{ label: "Requirements", href: "/requirements" }] : []), { label: "Apply" }]}
        actions={
          <>
            <WhatsAppButton message={requirement ? `Hello Venkat Sai, I would like to apply for ${requirement.title}.` : "Hello Venkat Sai, I would like to apply for a job abroad."} label="Apply on WhatsApp" />
            <CallButton className="border border-white/30 bg-white/5 hover:bg-white/10" />
          </>
        }
      />
      <div className="container-page grid gap-10 py-10 sm:py-14 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,0.6fr)]">
        <div className="min-w-0">
          {sent ? (
            <CvConfirmation result={{ code: sentCode, name: "", trade: "", requirementTitle: null, hasCv: pick(sp, "nocv") !== "1" }} whatsappGroupUrl={whatsappGroupUrl} />
          ) : (
            <>
              {error ? (
                <p role="alert" className="mb-5 rounded-xl border border-destructive/40 bg-danger-soft p-4 text-sm text-danger-strong">
                  {error === "rate_limited"
                    ? "You have sent several applications in a short time. Please wait a little, or send your CV on WhatsApp."
                    : "Your application could not be sent. Please fill in your name, mobile number and trade. A CV must be a PDF, Word file or photo under 4 MB."}
                </p>
              ) : null}
              {sharedNotice ? (
                <p role="status" className="mb-5 rounded-xl border border-border bg-surface-subtle p-4 text-sm text-foreground" data-testid="shared-notice">
                  {sharedNotice}
                </p>
              ) : null}
              <SendCvForm
                trades={trades}
                posterTrades={poster ? posterTradeOptions(poster.card.trades, trades) : []}
                countries={countries.map((c) => ({ value: c.code, label: c.name }))}
                requirement={requirement}
                whatsappGroupUrl={whatsappGroupUrl}
                shared={sharedUsable}
                referralCode={referralCode}
                defaults={defaults}
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
              <span>We never charge candidates to apply. Your details are only seen by our recruitment team.</span>
            </li>
          </ul>
          <div className="rounded-xl border border-border bg-surface-subtle p-4">
            <h3 className="flex items-center gap-2 font-heading text-base font-semibold text-navy">
              <FilePen className="size-5 shrink-0" aria-hidden="true" />
              No proper CV yet?
            </h3>
            <p className="mt-1 text-sm text-foreground">You can apply without one. If you want, we can also prepare a professional resume for you in Word and PDF. This is an optional paid service, separate from any job application.</p>
            <Link href="/resume-service" className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-navy underline underline-offset-4" data-testid="resume-service-link">
              Prepare my resume
            </Link>
          </div>
          <InstallAppButton />
        </aside>
      </div>
    </>
  );
}
