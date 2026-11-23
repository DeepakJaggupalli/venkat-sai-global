import { ShieldCheck } from "lucide-react";
import Link from "next/link";
import type { Metadata } from "next";

import { PageHero } from "@/components/public/page-hero";
import { buildPageMetadata } from "@/components/public/server";
import { sp as pick, type SearchParams } from "@/lib/http";

import { CvStatusForm } from "./status-form";

export const metadata: Metadata = buildPageMetadata({
  title: "Check your CV status",
  description: "See where your CV is in the placement journey with your mobile number and reference.",
  path: "/status",
  noindex: true,
});

/** Public CV status check: mobile number + reference → initials, trade, stage tracker and the note for the candidate. */
export default async function CvStatusPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ref = pick(await searchParams, "ref")?.toUpperCase();
  const defaultReference = ref && /^VSG-CV-\d{4,10}$/.test(ref) ? ref : undefined;
  return (
    <>
      <PageHero
        eyebrow="Jobs abroad"
        title="Check your CV status"
        intro="Enter the mobile number you gave us and your reference to see where your application is."
        breadcrumbs={[{ label: "Home", href: "/" }, { label: "Check your CV status" }]}
      />
      <div className="container-page max-w-3xl space-y-6 py-10 sm:py-14">
        <CvStatusForm defaultReference={defaultReference} />
        <p className="flex items-start gap-2 text-sm text-foreground">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-navy" aria-hidden="true" />
          <span>
            We only show your initials, trade and progress here. No reference yet?{" "}
            <Link href="/send-cv" className="font-medium text-navy underline underline-offset-4">
              Send your CV
            </Link>
            . We never charge candidates to apply.
          </span>
        </p>
      </div>
    </>
  );
}
