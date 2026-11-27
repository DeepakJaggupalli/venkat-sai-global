import { Award, FileCheck2, GraduationCap, Laptop, Send } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PageHero } from "@/components/public/page-hero";
import { WhatsAppButton } from "@/components/public/requirements/contact-buttons";
import { buildPageMetadata, settle } from "@/components/public/server";
import { INTERNSHIPS_PUBLIC_PATH } from "@/modules/documents/content";
import { listOpenProgrammes } from "@/modules/documents/service";

import { CARD, PILL_DARK } from "../refer/_components/styles";
import { ProgrammeFacts } from "./_components/programme-facts";

export const metadata: Metadata = buildPageMetadata({
  title: "Internships",
  description: "Online and workshop internships with Venkat Sai in Visakhapatnam. Apply online. When you finish you get an internship certificate and a letter of recommendation that anyone can check.",
  path: INTERNSHIPS_PUBLIC_PATH,
});

const STEPS = [
  { icon: Send, title: "Apply here", text: "Name and WhatsApp number are enough. No account needed." },
  { icon: FileCheck2, title: "Get your offer letter", text: "When you are selected we send it on WhatsApp or email." },
  { icon: Laptop, title: "Do the internship", text: "Online or at our workshop, with real tasks and guidance." },
  { icon: Award, title: "Certificate and LOR", text: "When you finish: an internship certificate and a letter of recommendation, each with a QR code to check it." },
] as const;

/** Public list of Venkat Sai internships that take applications (only programmes the owner opened). */
export default async function InternshipsPage() {
  const programmes = await settle("open_internships", () => listOpenProgrammes(), []);

  return (
    <>
      <PageHero
        eyebrow="Internships"
        title="Internships with Venkat Sai"
        intro={<p>Learn on real work, online or at our workshop in Visakhapatnam. When you finish, you get an internship certificate and a letter of recommendation that employers can check.</p>}
        breadcrumbs={[{ label: "Home", href: "/" }, { label: "Internships" }]}
        actions={
          programmes.length ? (
            <a href="#open" className={PILL_DARK}>
              See open internships
            </a>
          ) : undefined
        }
      />
      <div className="container-page space-y-12 pb-16 sm:pb-24">
        <section aria-labelledby="how-heading">
          <h2 id="how-heading" className="sr-only">
            How it works
          </h2>
          <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step, i) => (
              <li key={step.title} className="flex gap-3 rounded-3xl border border-border bg-surface-subtle p-4 sm:p-5">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white text-teal-strong shadow-xs" aria-hidden="true">
                  <step.icon className="size-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-muted-foreground">Step {i + 1}</p>
                  <p className="font-semibold text-foreground">{step.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{step.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section id="open" aria-labelledby="open-heading" className="scroll-mt-24 space-y-5">
          <h2 id="open-heading" className="font-heading text-2xl font-semibold text-navy">
            Open internships
          </h2>
          {programmes.length ? (
            <ul className="grid gap-5 lg:grid-cols-2" data-testid="open-internships">
              {programmes.map((p) => (
                <li key={p.id} className={`${CARD} flex flex-col gap-4`}>
                  <div className="flex items-start gap-3">
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-teal-soft text-teal-strong" aria-hidden="true">
                      <GraduationCap className="size-5" />
                    </span>
                    <h3 className="font-heading text-lg font-semibold text-navy">{p.title}</h3>
                  </div>
                  <ProgrammeFacts p={p} />
                  {p.description ? <p className="line-clamp-4 text-sm whitespace-pre-line text-muted-foreground">{p.description}</p> : null}
                  <div className="mt-auto">
                    <Link href={`${INTERNSHIPS_PUBLIC_PATH}/${p.id}`} className={PILL_DARK} data-testid="internship-apply-link">
                      Details and apply
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className={`${CARD} space-y-3 text-center`} data-testid="no-internships">
              <p className="font-semibold text-foreground">No internship is taking applications right now.</p>
              <p className="text-sm text-muted-foreground">Message us on WhatsApp and we will tell you when the next batch opens.</p>
              <div className="flex justify-center">
                <WhatsAppButton message="Hello, please tell me when the next internship opens." />
              </div>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
