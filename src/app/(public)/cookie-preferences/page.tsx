import { Cookie } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { ConsentPreferences } from "@/components/privacy/consent-preferences";

import { PublicHero } from "../news/_components/public-hero";

export const metadata: Metadata = {
  title: "Cookie preferences",
  description: "Choose which optional cookies Venkat Sai Global may use. Essential cookies keep the site working and secure.",
  alternates: { canonical: "/cookie-preferences" },
  robots: { index: false, follow: true },
};

export default function CookiePreferencesPage() {
  return (
    <>
      <PublicHero
        eyebrow="Privacy"
        title="Cookie preferences"
        description="Choose which optional cookies we may use. Nothing optional is switched on unless you turn it on, and you can change your mind at any time."
        breadcrumbs={[{ label: "Cookie preferences" }]}
      />
      <div className="container-page max-w-3xl py-10 sm:py-14">
        <div className="rounded-xl border border-border/80 bg-card p-5 shadow-xs sm:p-8">
          <ConsentPreferences />
        </div>
        <p className="mt-6 flex items-start gap-2 text-sm text-muted-foreground">
          <Cookie className="mt-0.5 size-4 shrink-0 text-teal" aria-hidden="true" />
          <span>
            Read the{" "}
            <Link href="/legal/cookie-policy" className="font-medium text-teal-strong hover:underline">
              cookie policy
            </Link>{" "}
            for details of each cookie, or the{" "}
            <Link href="/legal/privacy-policy" className="font-medium text-teal-strong hover:underline">
              privacy policy
            </Link>{" "}
            for how we handle personal data.
          </span>
        </p>
      </div>
    </>
  );
}
