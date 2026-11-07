"use client";

import { Cookie, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { ConsentServices } from "@/modules/analytics/types";

import { applyGpcDefault, dismissGpcNotice, isGpcNoticePending, onOpenCookiePreferences, subscribeConsent } from "./consent-store";
import { ConsentPreferencesForm } from "./consent-preferences-form";
import { consentMessages } from "./messages";
import { useConsent } from "./use-consent";

export type ConsentBannerClientProps = {
  version: string;
  services: ConsentServices;
  locale: string;
  /** Server-side reading of the consent cookie (renders the banner in the initial HTML when needed). */
  initialNeedsPrompt: boolean;
};

/** The preferences page itself shows the form; no banner there. */
const NO_BANNER_PATHS = ["/cookie-preferences"];

/**
 * Non-blocking bottom banner shown until the visitor makes a choice for the current consent version.
 * Accept all / Reject non-essential have equal weight; Customise opens the preferences form in a dialog.
 * With a Global Privacy Control signal and no choice yet, the signal is recorded as the choice
 * (analytics and session insights off) and a short notice is shown instead of asking.
 */
export function ConsentBannerClient({ version, services, locale, initialNeedsPrompt }: ConsentBannerClientProps) {
  const consent = useConsent(version);
  const pathname = usePathname();
  const t = consentMessages(locale);
  const [dialogOpen, setDialogOpen] = useState(false);
  const gpcNoticePending = useSyncExternalStore(subscribeConsent, isGpcNoticePending, () => false);
  const autoRecorded = useRef(false);
  const titleId = useId();
  const bodyId = useId();

  useEffect(() => onOpenCookiePreferences(() => setDialogOpen(true)), []);

  const { ready, needsPrompt, gpc } = consent;
  useEffect(() => {
    if (!ready || !needsPrompt || !gpc || autoRecorded.current) return;
    autoRecorded.current = true;
    applyGpcDefault({ version, locale });
  }, [ready, needsPrompt, gpc, version, locale]);

  const onPreferencesPage = NO_BANNER_PATHS.includes(pathname);
  const showPrompt = !onPreferencesPage && (ready ? needsPrompt && !gpc : initialNeedsPrompt);
  const showGpcNotice = !onPreferencesPage && !showPrompt && gpcNoticePending;

  return (
    <>
      {showPrompt || showGpcNotice ? (
        <section
          role="region"
          aria-labelledby={titleId}
          aria-describedby={bodyId}
          className="fixed inset-x-0 bottom-0 z-50 border-t bg-background shadow-[0_-4px_24px_rgba(16,28,53,0.12)] print:hidden"
        >
          <div className="container-page flex flex-col gap-3 py-4 md:flex-row md:items-end md:justify-between md:gap-6">
            <div className="min-w-0 max-w-3xl">
              <h2 id={titleId} className="flex items-center gap-2 font-heading text-base font-semibold">
                {showGpcNotice ? <ShieldCheck aria-hidden="true" className="size-5 text-teal-strong" /> : <Cookie aria-hidden="true" className="size-5 text-teal-strong" />}
                {showGpcNotice ? t.cookiePreferences : t.bannerTitle}
              </h2>
              <p id={bodyId} className="mt-1 text-sm text-muted-foreground">
                {showGpcNotice ? t.gpcNotice : t.bannerBody}
              </p>
              <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                <Link href="/legal/cookie-policy" className="font-medium text-teal-strong underline underline-offset-4 hover:no-underline">
                  {t.cookiePolicy}
                </Link>
                <Link href="/cookie-preferences" className="font-medium text-teal-strong underline underline-offset-4 hover:no-underline">
                  {t.cookiePreferences}
                </Link>
              </p>
            </div>
            {showGpcNotice ? (
              <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
                <Button size="lg" onClick={dismissGpcNotice}>
                  {t.ok}
                </Button>
              </div>
            ) : (
              <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
                <Button size="lg" onClick={() => consent.acceptAll({ source: "cookie_banner", locale })} disabled={!ready}>
                  {t.acceptAll}
                </Button>
                <Button size="lg" onClick={() => consent.rejectAll({ source: "cookie_banner", locale })} disabled={!ready}>
                  {t.rejectAll}
                </Button>
                <Button size="lg" variant="outline" onClick={() => setDialogOpen(true)} disabled={!ready}>
                  {t.customise}
                </Button>
              </div>
            )}
          </div>
        </section>
      ) : null}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t.dialogTitle}</DialogTitle>
            <DialogDescription>{t.dialogDescription}</DialogDescription>
          </DialogHeader>
          <ConsentPreferencesForm
            version={version}
            services={services}
            locale={locale}
            source="cookie_banner"
            onSaved={() => {
              dismissGpcNotice();
              setDialogOpen(false);
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
