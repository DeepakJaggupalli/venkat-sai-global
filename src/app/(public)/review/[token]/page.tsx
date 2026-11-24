import { ShieldCheck } from "lucide-react";
import type { Metadata } from "next";

import { PageHero } from "@/components/public/page-hero";
import { settle } from "@/components/public/server";
import { countryOptions } from "@/modules/taxonomy/queries";
import { resolveWorkerReviewLink } from "@/modules/worker-reviews/service";

import { LinkProblem } from "../_components/link-problem";
import { WorkerReviewForm } from "../_components/review-form";

// A private link sent to one worker: never indexed, and the token is not passed on to other sites.
export const metadata: Metadata = {
  title: "Your review",
  description: "Tell us about your experience with Venkat Sai Global.",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/**
 * /review/<signed token>: a placed worker reviews Venkat Sai (stars, a few words, name to show, trade, country and the
 * optional permission to show it on the website). The link works for 30 days and for one review per CV.
 */
export default async function WorkerReviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const link = await resolveWorkerReviewLink(token);
  const countries = link.state === "open" ? await settle("countries", () => countryOptions(), []) : [];

  return (
    <>
      <PageHero
        eyebrow="Your review"
        title="How was your experience with Venkat Sai?"
        intro={
          link.state === "open"
            ? `${link.firstName ? `Hello ${link.firstName}. ` : ""}Your review helps other workers choose an honest agency, and helps us do better. It takes about two minutes.`
            : undefined
        }
      />
      <div className="container-page max-w-3xl space-y-6 py-10 sm:py-14">
        {link.state === "open" ? (
          <WorkerReviewForm token={token} firstName={link.firstName} defaults={{ displayName: link.displayName, trade: link.trade, countryCode: link.countryCode }} countries={countries} />
        ) : (
          <LinkProblem kind={link.state === "used" ? "used" : "expired"} firstName={link.state === "used" ? link.firstName : undefined} />
        )}
        <p className="flex items-start gap-2 text-sm text-foreground">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-teal-strong" aria-hidden="true" />
          <span>We read every review before it goes on our website, and we never change your words.</span>
        </p>
      </div>
    </>
  );
}
