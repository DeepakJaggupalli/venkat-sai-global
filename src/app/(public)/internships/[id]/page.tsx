import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHero } from "@/components/public/page-hero";
import { WhatsAppButton } from "@/components/public/requirements/contact-buttons";
import { buildPageMetadata } from "@/components/public/server";
import { INTERNSHIPS_PUBLIC_PATH } from "@/modules/documents/content";
import { getOpenProgramme } from "@/modules/documents/service";

import { CARD } from "../../refer/_components/styles";
import { InternshipApplyForm } from "../_components/apply-form";
import { ProgrammeFacts } from "../_components/programme-facts";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const p = await getOpenProgramme(id).catch(() => null);
  return buildPageMetadata({
    title: p ? `${p.title} · Internship` : "Internship",
    description: p ? `Apply for ${p.title} with Venkat Sai. Certificate and letter of recommendation when you finish.` : "Internships with Venkat Sai.",
    path: `${INTERNSHIPS_PUBLIC_PATH}/${id}`,
  });
}

/** One open internship: what it is, who can apply, and the apply form. Closed or unknown programmes are 404. */
export default async function InternshipPage({ params }: Props) {
  const { id } = await params;
  const p = await getOpenProgramme(id);
  if (!p) notFound();

  return (
    <>
      <PageHero
        eyebrow="Internship"
        title={p.title}
        intro={<ProgrammeFacts p={p} />}
        breadcrumbs={[{ label: "Home", href: "/" }, { label: "Internships", href: INTERNSHIPS_PUBLIC_PATH }, { label: p.title }]}
      />
      <div className="container-page grid gap-8 pb-16 sm:pb-24 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="space-y-6">
          <section className={`${CARD} space-y-4`}>
            <h2 className="font-heading text-xl font-semibold text-navy">About this internship</h2>
            {p.description ? <p className="whitespace-pre-line text-foreground/85">{p.description}</p> : <p className="text-muted-foreground">Message us on WhatsApp for the details.</p>}
            {p.eligibility ? (
              <>
                <h3 className="font-semibold text-foreground">Who can apply</h3>
                <p className="whitespace-pre-line text-foreground/85">{p.eligibility}</p>
              </>
            ) : null}
          </section>
          <section className={`${CARD} space-y-3`}>
            <h2 className="font-heading text-lg font-semibold text-navy">What you get</h2>
            <ul className="list-disc space-y-1.5 ps-5 text-foreground/85">
              <li>An offer letter when you are selected.</li>
              <li>An internship certificate when you finish.</li>
              <li>A letter of recommendation (LOR) about your work.</li>
              <li>Each document has a QR code, so colleges and employers can check it is genuine.</li>
            </ul>
            <p className="text-sm text-muted-foreground">
              Questions? <WhatsAppButton message={`Hello, I have a question about the internship: ${p.title}`} label="Ask on WhatsApp" className="ms-1 align-middle" />
            </p>
          </section>
          <p className="text-sm">
            <Link href={INTERNSHIPS_PUBLIC_PATH} className="font-semibold text-teal-strong underline-offset-4 hover:underline">
              See all internships
            </Link>
          </p>
        </div>
        <InternshipApplyForm programmeId={p.id} programmeTitle={p.title} />
      </div>
    </>
  );
}
