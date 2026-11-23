"use client";

import { Globe } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { setLocaleAction } from "@/components/i18n/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  isLocale,
  isPublicLocale,
  isPublicRegion,
  LOCALE_COOKIE,
  PREFS_SEEN_COOKIE,
  PUBLIC_LOCALE_COOKIE,
  PUBLIC_LOCALE_LABELS,
  PUBLIC_LOCALES,
  PUBLIC_REGIONS,
  REGION_COOKIE,
  type PublicLocale,
  type PublicRegion,
} from "@/i18n/config";
import { cn } from "@/lib/utils";

const YEAR = 60 * 60 * 24 * 365;
const FIRST_VISIT_DELAY_MS = 1200;
/** Crawlers, link previews and automated browsers never get the first-visit prompt. */
const BOT = /bot|crawl|spider|slurp|facebookexternalhit|embedly|preview|lighthouse|headless/i;

const TIME_ZONE_REGION: Record<string, PublicRegion> = {
  "Asia/Kolkata": "IN",
  "Asia/Calcutta": "IN",
  "Asia/Dubai": "AE",
  "Asia/Riyadh": "SA",
  "Asia/Qatar": "QA",
  "Asia/Kuwait": "KW",
  "Asia/Muscat": "OM",
  "Asia/Bahrain": "BH",
  "Asia/Singapore": "SG",
  "Asia/Kuala_Lumpur": "MY",
};

function readCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]!) : null;
}

function writeCookie(name: string, value: string, maxAge = YEAR) {
  const secure = window.location.protocol === "https:" ? "; secure" : "";
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}; samesite=lax${secure}`;
}

/** ?lang= → saved public-only language → saved language → browser language → English. */
function currentLanguage(): PublicLocale {
  const fromUrl = new URLSearchParams(window.location.search).get("lang");
  if (isPublicLocale(fromUrl)) return fromUrl;
  const saved = readCookie(PUBLIC_LOCALE_COOKIE) ?? readCookie(LOCALE_COOKIE);
  if (isPublicLocale(saved)) return saved;
  const browser = navigator.language?.slice(0, 2).toLowerCase();
  return isPublicLocale(browser) ? browser : "en";
}

/** Saved region → a guess from the time zone → India. */
function currentRegion(): PublicRegion {
  const saved = readCookie(REGION_COOKIE);
  if (isPublicRegion(saved)) return saved;
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
  return TIME_ZONE_REGION[zone] ?? (zone.startsWith("Europe/") ? "EU" : "IN");
}

const CHIP =
  "inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-full border border-border bg-white px-3.5 text-sm font-medium text-foreground transition-colors hover:border-[#c9cdd5] peer-checked:border-foreground peer-checked:bg-foreground peer-checked:text-white peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2";

/**
 * Globe "Language & region" button for the public header, and the dialog it opens: page language (the five public
 * languages, in their own script) and region. On a visitor's first public page the same dialog opens once by
 * itself (a bottom sheet on phones), only in the browser and never for crawlers or automated browsers. English,
 * Hindi and Telugu are saved like the portal switcher (LOCALE_COOKIE + profile); Odia and Arabic in
 * PUBLIC_LOCALE_COOKIE; the region in REGION_COOKIE. All cookies last a year.
 */
export function PublicPreferences({ className }: { className?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [firstVisit, setFirstVisit] = useState(false);
  const [language, setLanguage] = useState<PublicLocale>("en");
  const [region, setRegion] = useState<PublicRegion>("IN");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (readCookie(PREFS_SEEN_COOKIE) || readCookie(REGION_COOKIE)) return;
    if (navigator.webdriver || BOT.test(navigator.userAgent)) return;
    const timer = window.setTimeout(() => {
      setLanguage(currentLanguage());
      setRegion(currentRegion());
      setFirstVisit(true);
      setOpen(true);
    }, FIRST_VISIT_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, []);

  function show() {
    setLanguage(currentLanguage());
    setRegion(currentRegion());
    setFirstVisit(false);
    setOpen(true);
  }

  function onOpenChange(next: boolean) {
    if (!next) writeCookie(PREFS_SEEN_COOKIE, "1");
    setOpen(next);
  }

  function save() {
    writeCookie(REGION_COOKIE, region);
    writeCookie(PREFS_SEEN_COOKIE, "1");
    if (isLocale(language)) writeCookie(PUBLIC_LOCALE_COOKIE, "", 0);
    else writeCookie(PUBLIC_LOCALE_COOKIE, language);
    setOpen(false);
    startTransition(async () => {
      if (isLocale(language)) await setLocaleAction(language);
      const url = new URL(window.location.href);
      if (url.searchParams.has("lang")) {
        url.searchParams.delete("lang");
        router.replace(`${url.pathname}${url.search}${url.hash}`, { scroll: false });
      }
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={show}
        disabled={pending}
        title="Language & region"
        className={cn(
          "inline-flex size-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-surface-subtle hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60",
          className,
        )}
        data-testid="header-preferences"
      >
        <Globe aria-hidden="true" className="size-5" />
        <span className="sr-only">Language &amp; region</span>
      </button>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="gap-6 p-6 max-sm:top-auto max-sm:bottom-0 max-sm:max-w-none max-sm:translate-y-0 max-sm:rounded-b-none sm:max-w-md"
          data-testid="preferences-dialog"
        >
          <DialogHeader>
            <DialogTitle className="font-display text-xl">Language &amp; region</DialogTitle>
            <DialogDescription>
              {firstVisit ? "Welcome! Choose your language and where you are. " : null}You can change this any time with the globe button at the top.
            </DialogDescription>
          </DialogHeader>
          <fieldset>
            <legend className="mb-3 text-sm font-semibold text-foreground">Language</legend>
            <div className="flex flex-wrap gap-2">
              {PUBLIC_LOCALES.map((code) => (
                <label key={code} className="relative">
                  <input type="radio" name="vsg-language" value={code} checked={language === code} onChange={() => setLanguage(code)} className="peer sr-only" />
                  <span className={CHIP} lang={code}>
                    {PUBLIC_LOCALE_LABELS[code].label}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-3 text-sm font-semibold text-foreground">Region</legend>
            <div className="flex flex-wrap gap-2">
              {PUBLIC_REGIONS.map((r) => (
                <label key={r.code} className="relative">
                  <input type="radio" name="vsg-region" value={r.code} checked={region === r.code} onChange={() => setRegion(r.code)} className="peer sr-only" />
                  <span className={CHIP}>{r.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <DialogFooter className="-mx-6 -mb-6 px-6 max-sm:rounded-b-none">
            <Button type="button" variant="ghost" className="rounded-full" onClick={() => onOpenChange(false)}>
              {firstVisit ? "Not now" : "Cancel"}
            </Button>
            <Button type="button" className="rounded-full" onClick={save} data-testid="preferences-save">
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
