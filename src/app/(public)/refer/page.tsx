import { BadgeCheck, Gift, Link2, Send, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { WhatsAppIcon } from "@/components/public/contact-links";
import { PageHero } from "@/components/public/page-hero";
import { CallButton, WhatsAppButton } from "@/components/public/requirements/contact-buttons";
import { buildPageMetadata, settle } from "@/components/public/server";
import { getReferralRewardText } from "@/modules/referrals/service";

import { ReferForms } from "./_components/refer-forms";
import { PILL_DARK, PILL_LIGHT } from "./_components/styles";

export const metadata: Metadata = buildPageMetadata({
  title: "Refer a friend",
  description: "Share your personal link with friends who want a job abroad. When someone you refer gets a job abroad through Venkat Sai Global, you get a reward.",
  path: "/refer",
});

const STEPS = [
  { icon: Link2, title: "Get your link", text: "Enter your name and mobile number below." },
  { icon: WhatsAppIcon, title: "Share it on WhatsApp", text: "Send it to friends and groups looking for work abroad." },
  { icon: Send, title: "Your friend sends their CV", text: "Through your link. Applying is free for them." },
  { icon: Gift, title: "You get your reward", text: "When your friend flies abroad for a job through us." },
] as const;

/**
 * Public "Refer a friend" page: what the reward is (only the wording the business set in Settings → Referrals; no
 * amount is ever invented), how it works, "Get my link" and "Check my referrals".
 */
export default async function ReferPage() {
  const rewardText = await settle("referral_reward_text", () => getReferralRewardText(), "");

  return (
    <>
      <PageHero
        eyebrow="Refer a friend"
        title="Refer a friend"
        intro={
          <>
            <p>When someone you refer gets a job abroad through us, you get a reward.</p>
            {rewardText ? (
              <p className="mt-4 inline-flex items-start gap-2 rounded-2xl border border-teal/30 bg-teal-soft px-4 py-3 text-base font-semibold text-foreground" data-testid="referral-reward-text">
                <Gift className="mt-0.5 size-5 shrink-0 text-teal-strong" aria-hidden="true" />
                <span>Reward: {rewardText}</span>
              </p>
            ) : null}
          </>
        }
        breadcrumbs={[{ label: "Home", href: "/" }, { label: "Refer a friend" }]}
        actions={
          <>
            <a href="#get-link" className={PILL_DARK}>
              Get my link
            </a>
            <a href="#check" className={PILL_LIGHT}>
              Check my referrals
            </a>
          </>
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
                  <p className="text-base font-semibold text-foreground">{step.title}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">{step.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <ReferForms />

        <section aria-labelledby="good-to-know-heading" className="grid gap-8 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,0.7fr)]">
          <div>
            <h2 id="good-to-know-heading" className="font-display text-3xl text-foreground sm:text-4xl">
              Good to know
            </h2>
            <ul className="mt-6 space-y-4 text-base leading-relaxed text-foreground">
              <li className="flex gap-3">
                <ShieldCheck className="mt-0.5 size-5 shrink-0 text-teal-strong" aria-hidden="true" />
                <span>
                  <strong className="font-semibold">Your friend never pays anything.</strong> Venkat Sai Global never charges candidates to apply.{" "}
                  <Link href="/safe-recruitment" className="font-medium text-teal-strong underline underline-offset-4">
                    How to stay safe
                  </Link>
                </span>
              </li>
              <li className="flex gap-3">
                <BadgeCheck className="mt-0.5 size-5 shrink-0 text-teal-strong" aria-hidden="true" />
                <span>The reward is due when your friend has flown abroad for a job through us. We call or WhatsApp you on your number to arrange it.</span>
              </li>
              <li className="flex gap-3">
                <Link2 className="mt-0.5 size-5 shrink-0 text-teal-strong" aria-hidden="true" />
                <span>Your friend should send their CV through your link. If they applied another way, WhatsApp us your code and their name.</span>
              </li>
              <li className="flex gap-3">
                <ShieldCheck className="mt-0.5 size-5 shrink-0 text-teal-strong" aria-hidden="true" />
                <span>
                  You see only your friend&rsquo;s first name, trade and progress, never their number or documents. We use your name and number only for your referrals and rewards.
                </span>
              </li>
            </ul>
          </div>
          <aside aria-label="Questions" className="h-fit rounded-3xl border border-border bg-white p-5 shadow-card sm:p-6">
            <h3 className="text-lg font-semibold text-foreground">Questions about referrals?</h3>
            <p className="mt-1 text-base text-muted-foreground">Message us on WhatsApp or call the office.</p>
            <div className="mt-4 flex flex-col gap-3">
              <WhatsAppButton message="Hello Venkat Sai, I have a question about referring a friend." />
              <CallButton label="Call us" />
            </div>
          </aside>
        </section>
      </div>
    </>
  );
}
