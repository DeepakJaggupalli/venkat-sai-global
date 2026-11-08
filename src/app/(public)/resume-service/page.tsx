import { ClipboardList, FileText, MessageCircle, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";

import { PageHero } from "@/components/public/page-hero";
import { CallButton, EmailButton, WhatsAppButton } from "@/components/public/requirements/contact-buttons";
import { buildPageMetadata, settle } from "@/components/public/server";
import { ResumeForm } from "@/components/resume/resume-form";
import { PRICE_ON_REQUEST, resumePriceLabel } from "@/modules/resume-service/price";
import { getResumeServicePrice } from "@/modules/resume-service/service";
import { isFeatureEnabled } from "@/modules/settings";

export const metadata: Metadata = buildPageMetadata({
  title: "Prepare my resume",
  description: "Get a professionally formatted resume in Word and PDF, in the layout overseas employers expect. A paid service, separate from job applications.",
  path: "/resume-service",
});

/** Public "Prepare my resume" page: a paid resume-writing service (never a condition of any job application). */
export default async function ResumeServicePage() {
  const [enabled, price] = await Promise.all([settle("resume_service_flag", () => isFeatureEnabled("services.resume_writing"), false), settle("resume_service_price", () => getResumeServicePrice(), null)]);
  const priceLabel = price ? resumePriceLabel(price) : PRICE_ON_REQUEST;

  return (
    <>
      <PageHero
        eyebrow="Resume service"
        title="Prepare my resume"
        intro="Send us your details and we prepare a neat, professional resume in Word and PDF, in the format overseas employers and agents expect: photo, personal details, passport details and your experience abroad and in India."
        breadcrumbs={[{ label: "Home", href: "/" }, { label: "Send your CV", href: "/send-cv" }, { label: "Prepare my resume" }]}
        actions={
          <>
            <WhatsAppButton message="Hello Venkat Sai, I would like you to prepare my resume." label="Ask on WhatsApp" />
            <CallButton className="border border-white/30 bg-white/5 hover:bg-white/10" />
          </>
        }
      />
      <div className="container-page grid gap-10 py-10 sm:py-14 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,0.6fr)]">
        <div className="min-w-0">
          {enabled ? (
            <ResumeForm mode="public" />
          ) : (
            <div className="rounded-2xl border border-border bg-white p-6">
              <h2 className="font-heading text-xl font-semibold text-navy">The online form is not available right now</h2>
              <p className="mt-2 text-base text-foreground">Message us on WhatsApp or call us and we will prepare your resume with you.</p>
              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <WhatsAppButton message="Hello Venkat Sai, I would like you to prepare my resume." className="min-h-14 text-lg" />
                <CallButton label="Call us" className="min-h-14 text-lg" />
                <EmailButton subject="Resume service" />
              </div>
            </div>
          )}
        </div>
        <aside aria-label="About the resume service" className="space-y-6">
          <div className="rounded-2xl border border-border bg-surface-subtle p-5">
            <p className="text-sm font-medium text-muted-foreground">Price</p>
            <p className="mt-1 font-heading text-2xl font-semibold text-navy" data-testid="resume-price">
              {priceLabel}
            </p>
            <p className="mt-2 text-sm text-foreground">You pay only for preparing the resume. Our team confirms the price and collects the payment on WhatsApp or phone before we start.</p>
          </div>
          <div>
            <h2 className="font-heading text-lg font-semibold text-navy">How it works</h2>
            <ul className="mt-3 space-y-4 text-sm leading-relaxed text-foreground">
              <li className="flex gap-3">
                <ClipboardList className="mt-0.5 size-5 shrink-0 text-navy" aria-hidden="true" />
                <span>Fill in your details, passport and work experience. Add a photo on a white background if you have one.</span>
              </li>
              <li className="flex gap-3">
                <MessageCircle className="mt-0.5 size-5 shrink-0 text-navy" aria-hidden="true" />
                <span>We call or WhatsApp you to check the details and collect the payment.</span>
              </li>
              <li className="flex gap-3">
                <FileText className="mt-0.5 size-5 shrink-0 text-navy" aria-hidden="true" />
                <span>You get your resume in Word and PDF through a private download link.</span>
              </li>
              <li className="flex gap-3">
                <ShieldCheck className="mt-0.5 size-5 shrink-0 text-navy" aria-hidden="true" />
                <span>This service is optional. Venkat Sai never charges candidates to apply for a job, and no payment can guarantee a job or visa.</span>
              </li>
            </ul>
          </div>
        </aside>
      </div>
    </>
  );
}
