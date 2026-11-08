import { FileCheck2 } from "lucide-react";
import type { Metadata } from "next";

import { DocumentUploader } from "@/components/documents/document-uploader";
import { ScanExamples } from "@/components/documents/scan-examples";
import { PageHero } from "@/components/public/page-hero";
import { CallButton, EmailButton, WhatsAppButton } from "@/components/public/requirements/contact-buttons";
import { sp as pick, type SearchParams } from "@/lib/http";
import { listDocumentsForLink, resolveCvDocumentLink } from "@/modules/operations/cv-submission-documents";
import {
  CV_DOCUMENT_ACCEPT,
  CV_DOCUMENT_KIND_HINTS,
  CV_DOCUMENT_KIND_LABELS,
  CV_DOCUMENT_KIND_VALUES,
  CV_DOCUMENT_MAX_BYTES,
  CV_DOCUMENT_TYPES_LABEL,
} from "@/modules/operations/cv-submission-schemas";

export const metadata: Metadata = {
  title: "Add your documents",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

const kinds = CV_DOCUMENT_KIND_VALUES.map((value) => ({ value, label: CV_DOCUMENT_KIND_LABELS[value], hint: CV_DOCUMENT_KIND_HINTS[value] }));

/**
 * /send-cv/documents?t=<signed token> — the candidate adds certificates, licences, passport pages and a photo to the
 * CV they sent, one file at a time. The token (2 hours after sending the CV, or 7 days when staff send the link)
 * only allows adding documents; nothing already stored is shown except the kinds and file names.
 */
export default async function SendCvDocumentsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const token = pick(sp, "t") ?? null;
  const link = await resolveCvDocumentLink(token).catch(() => null);
  const already = link ? await listDocumentsForLink(link.id) : [];
  const message = link ? `Hello Venkat Sai, I have added my documents for CV ${link.code}.` : "Hello Venkat Sai, I would like to send my documents.";

  return (
    <>
      <PageHero
        eyebrow="Send your CV"
        title="Add your documents"
        intro="Certificates, licences, passport pages and a photo help us put your CV forward faster. Upload one file at a time. This step is optional."
        breadcrumbs={[{ label: "Home", href: "/" }, { label: "Send your CV", href: "/send-cv" }, { label: "Add your documents" }]}
      />
      <div className="container-page grid gap-10 py-10 sm:py-14 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <div className="min-w-0 space-y-6">
          {link && token ? (
            <>
              <div className="rounded-2xl border border-border bg-white p-5 shadow-sm sm:p-8">
                <h2 className="font-heading text-xl font-semibold text-navy">
                  {link.firstName ? `${link.firstName}, add` : "Add"} your documents to CV <span className="tabular-nums">{link.code}</span>
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  This link works until{" "}
                  {new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(link.expiresAt)} (India time). Only our recruitment team can see your documents.
                </p>
                <DocumentUploader
                  className="mt-6"
                  endpoint="/send-cv/documents/upload"
                  fields={{ token }}
                  kinds={kinds}
                  maxBytes={CV_DOCUMENT_MAX_BYTES}
                  accept={CV_DOCUMENT_ACCEPT}
                  typesLabel={CV_DOCUMENT_TYPES_LABEL}
                />
              </div>
              {already.length ? (
                <section aria-labelledby="already-heading" className="rounded-2xl border border-border bg-surface-subtle p-5">
                  <h2 id="already-heading" className="font-heading text-base font-semibold text-navy">
                    Already received
                  </h2>
                  <ul className="mt-3 space-y-1.5 text-sm text-foreground">
                    {already.map((d, i) => (
                      <li key={`${d.kind}-${i}`} className="flex gap-2">
                        <FileCheck2 className="mt-0.5 size-4 shrink-0 text-navy" aria-hidden="true" />
                        <span>
                          {d.kindLabel}: <span className="break-all">{d.fileName}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </>
          ) : (
            <div role="alert" className="rounded-2xl border border-warning/40 bg-warning-soft p-6">
              <h2 className="font-heading text-xl font-semibold text-navy">This upload link has expired</h2>
              <p className="mt-2 text-base text-foreground">Links are valid for a limited time to keep your documents safe. Message us on WhatsApp and we will send you a new link, or send the documents in the chat.</p>
            </div>
          )}
          <section aria-labelledby="finished-heading" className="rounded-2xl border border-border bg-white p-5 sm:p-6">
            <h2 id="finished-heading" className="font-heading text-lg font-semibold text-navy">
              Finished, or need help?
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">Tell us on WhatsApp when you are done, or call us.</p>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <WhatsAppButton message={message} className="min-h-14 text-lg" />
              <CallButton label="Call us" className="min-h-14 text-lg" />
              <EmailButton subject={link ? `Documents for CV ${link.code}` : "My documents"} />
            </div>
          </section>
        </div>
        <ScanExamples />
      </div>
    </>
  );
}
