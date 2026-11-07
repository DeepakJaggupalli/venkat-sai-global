"use client";

import { ArrowRight, Megaphone, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useSyncExternalStore } from "react";

import { cn } from "@/lib/utils";

import { isExternalHref } from "./nav-utils";
import { sanitizeHref } from "./public-nav";
import type { Announcement, AnnouncementTone } from "./types";

const STORAGE_PREFIX = "vsg:announcement-dismissed:";
const CHANGE_EVENT = "vsg:announcement-dismissed";

const TONES: Record<AnnouncementTone, { bar: string; button: string }> = {
  // Deep navy + hairline so it reads as separate from the navy utility row below it.
  neutral: { bar: "border-b border-white/10 bg-navy-deep text-white", button: "text-white/75 hover:bg-white/10 hover:text-white" },
  highlight: { bar: "bg-gold-soft text-navy", button: "text-navy/70 hover:bg-navy/5 hover:text-navy" },
  critical: { bar: "bg-destructive text-white", button: "text-white/80 hover:bg-white/10 hover:text-white" },
};

function readDismissed(id: string): boolean {
  try {
    return window.localStorage.getItem(STORAGE_PREFIX + id) === "1";
  } catch {
    return false;
  }
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

/**
 * Site-wide announcement strip above the public header. Dismissal is a per-visitor convenience kept in
 * localStorage (keyed by announcement id); if storage is unavailable the strip simply stays visible.
 */
export function AnnouncementBar({ announcement }: { announcement: Announcement }) {
  const { id, message, linkLabel, tone = "neutral", dismissible = true } = announcement;
  const dismissed = useSyncExternalStore(
    subscribe,
    () => readDismissed(id),
    () => false,
  );
  const dismiss = useCallback(() => {
    try {
      window.localStorage.setItem(STORAGE_PREFIX + id, "1");
    } catch {
      // Storage blocked: hide for this page view only.
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, [id]);

  if (dismissed && dismissible) return null;

  const styles = TONES[tone];
  const href = sanitizeHref(announcement.href);
  const external = href ? isExternalHref(href) : false;

  return (
    <div role="region" aria-label="Announcement" className={cn("relative z-50", styles.bar)}>
      <div className="mx-auto flex max-w-[96rem] items-center gap-3 px-4 py-2.5 sm:px-6 lg:px-8">
        <Megaphone className="hidden size-4 shrink-0 opacity-80 sm:block" aria-hidden />
        <p className="min-w-0 flex-1 text-[13px] leading-5 sm:text-sm">
          <span>{message}</span>
          {href && (
            <>
              {" "}
              <Link
                href={href}
                {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                className="inline-flex items-center gap-1 font-semibold whitespace-nowrap underline decoration-current/40 underline-offset-4 hover:decoration-current"
              >
                {linkLabel?.trim() || "Learn more"}
                <ArrowRight className="size-3.5" aria-hidden />
                {external && <span className="sr-only"> (opens in a new tab)</span>}
              </Link>
            </>
          )}
        </p>
        {dismissible && (
          <button
            type="button"
            onClick={dismiss}
            className={cn("-mr-1.5 flex size-8 shrink-0 items-center justify-center rounded-md transition-colors", styles.button)}
            aria-label="Dismiss announcement"
          >
            <X className="size-4" aria-hidden />
          </button>
        )}
      </div>
    </div>
  );
}
