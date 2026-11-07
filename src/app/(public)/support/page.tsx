import { CircleHelp, LifeBuoy, ShieldAlert, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { getLocale } from "@/i18n/server";
import { getCurrentUser } from "@/modules/identity/session";
import { GUEST_TICKET_CATEGORIES, TICKET_CATEGORY_LABELS } from "@/modules/operations/constants";

import { PublicHero } from "../news/_components/public-hero";
import { listingMetadata } from "../news/_lib/cms";
import { submitSupportRequestAction } from "./actions";
import { TicketForm } from "./_components/ticket-form";

export const metadata: Metadata = listingMetadata(
  "Get support",
  "Ask Venkat Sai Global for help with your account, applications, documents, training or billing.",
  "/support",
);

const PORTAL_SUPPORT = [
  { href: "/talent/support", label: "People Portal support" },
  { href: "/employer/support", label: "Employer Portal support" },
  { href: "/recruiter/support", label: "Recruitment Partner Portal support" },
  { href: "/institution/support", label: "Institution Portal support" },
];

export default async function SupportPage() {
  const [user, locale] = await Promise.all([getCurrentUser(), getLocale()]);
  const categories = GUEST_TICKET_CATEGORIES.filter((c) => c !== "grievance").map((value) => ({ value, label: TICKET_CATEGORY_LABELS[value] }));

  return (
    <>
      <PublicHero
        eyebrow="Support"
        title="How can we help?"
        description="Send us your question and our support team will reply by email. Using the platform is free for candidates; we never ask you to pay to apply for a job."
        breadcrumbs={[{ label: "Support" }]}
      />
      <div className="container-page grid gap-10 py-10 sm:py-14 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 rounded-xl border border-border/80 bg-card p-5 shadow-xs sm:p-8">
          <TicketForm mode="support" formId="support" action={submitSupportRequestAction} signedInAs={user?.displayName ?? null} categories={categories} locale={locale} />
        </div>
        <aside className="space-y-6" aria-label="More help">
          <section aria-labelledby="support-faq-title" className="rounded-xl border border-border/80 bg-card p-6">
            <h2 id="support-faq-title" className="flex items-center gap-2 font-heading text-lg font-semibold text-navy">
              <CircleHelp className="size-5 text-teal" aria-hidden="true" />
              Quick answers
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">Many questions are answered in our FAQs.</p>
            <Link href="/faqs" className="mt-3 inline-block text-sm font-semibold text-teal-strong hover:underline">
              Read the FAQs
            </Link>
          </section>
          {user ? (
            <section aria-labelledby="support-portal-title" className="rounded-xl border border-border/80 bg-card p-6">
              <h2 id="support-portal-title" className="flex items-center gap-2 font-heading text-lg font-semibold text-navy">
                <LifeBuoy className="size-5 text-teal" aria-hidden="true" />
                Track your requests
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">You can raise requests, attach files and follow replies in the support section of the portal you use.</p>
              <ul className="mt-3 space-y-1.5 text-sm">
                {PORTAL_SUPPORT.map((p) => (
                  <li key={p.href}>
                    <Link href={p.href} className="font-medium text-teal-strong hover:underline">
                      {p.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          <section aria-labelledby="support-grievance-title" className="rounded-xl border border-border/80 bg-surface-subtle p-6">
            <h2 id="support-grievance-title" className="flex items-center gap-2 font-heading text-lg font-semibold text-navy">
              <ShieldAlert className="size-5 text-teal" aria-hidden="true" />
              Formal complaint?
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">Grievances about content, personal data or conduct have their own process, officer and timelines.</p>
            <Link href="/grievance" className="mt-3 inline-block text-sm font-semibold text-teal-strong hover:underline">
              Raise a grievance
            </Link>
          </section>
          <section aria-labelledby="support-fraud-title" className="rounded-xl border border-border/80 bg-surface-subtle p-6">
            <h2 id="support-fraud-title" className="flex items-center gap-2 font-heading text-lg font-semibold text-navy">
              <ShieldCheck className="size-5 text-teal" aria-hidden="true" />
              Asked to pay for a job?
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">Do not pay. Venkat Sai Global never charges candidates.</p>
            <Link href="/safe-recruitment" className="mt-3 inline-block text-sm font-semibold text-teal-strong hover:underline">
              How to stay safe
            </Link>
          </section>
        </aside>
      </div>
    </>
  );
}
