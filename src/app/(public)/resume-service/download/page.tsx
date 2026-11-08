import { Download, FileText } from "lucide-react";
import type { Metadata } from "next";

import { PageHero } from "@/components/public/page-hero";
import { CallButton, EmailButton, WhatsAppButton } from "@/components/public/requirements/contact-buttons";
import { Button } from "@/components/ui/button";
import { sp as pick, type SearchParams } from "@/lib/http";
import { resolveResumeDownload } from "@/modules/resume-service/service";

export const metadata: Metadata = {
  title: "Download your resume",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/** /resume-service/download?t=<signed token> — the candidate's private download page (Word and PDF). */
export default async function ResumeDownloadPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const token = pick(sp, "t") ?? null;
  const view = await resolveResumeDownload(token).catch(() => null);
  const href = (format: "docx" | "pdf") => `/resume-service/download/file?t=${encodeURIComponent(token ?? "")}&format=${format}`;

  return (
    <>
      <PageHero eyebrow="Resume service" title="Your resume" breadcrumbs={[{ label: "Home", href: "/" }, { label: "Prepare my resume", href: "/resume-service" }, { label: "Download" }]} />
      <div className="container-page max-w-3xl space-y-6 py-10 sm:py-14">
        {view ? (
          <div className="rounded-2xl border border-border bg-white p-6 shadow-sm sm:p-8">
            <FileText className="size-10 text-navy" aria-hidden="true" />
            <h2 className="mt-3 font-heading text-2xl font-semibold text-navy">{view.firstName ? `${view.firstName}, your resume is ready` : "Your resume is ready"}</h2>
            <p className="mt-2 text-base text-foreground">
              Reference <span className="tabular-nums">{view.code}</span>. Download the Word file to make changes, and the PDF to send to employers and agents. This link works until{" "}
              {new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "long", year: "numeric" }).format(view.expiresAt)}.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Button asChild className="min-h-12 text-base">
                <a href={href("pdf")} data-testid="resume-download-pdf">
                  <Download aria-hidden="true" />
                  Download PDF
                </a>
              </Button>
              <Button asChild variant="outline" className="min-h-12 text-base">
                <a href={href("docx")} data-testid="resume-download-docx">
                  <Download aria-hidden="true" />
                  Download Word
                </a>
              </Button>
            </div>
          </div>
        ) : (
          <div role="alert" className="rounded-2xl border border-warning/40 bg-warning-soft p-6">
            <h2 className="font-heading text-xl font-semibold text-navy">This download link has expired</h2>
            <p className="mt-2 text-base text-foreground">For your privacy, links work for a limited time. Message us on WhatsApp and we will send you a new link.</p>
          </div>
        )}
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <WhatsAppButton message={view ? `Hello Venkat Sai, about my resume ${view.code}.` : "Hello Venkat Sai, I need a new link for my resume."} className="min-h-14 text-lg" />
          <CallButton label="Call us" className="min-h-14 text-lg" />
          <EmailButton subject={view ? `Resume ${view.code}` : "My resume"} />
        </div>
      </div>
    </>
  );
}
