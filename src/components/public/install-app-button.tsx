"use client";

import { Download, Share } from "lucide-react";
import { useSyncExternalStore } from "react";

import { cn } from "@/lib/utils";

/**
 * "Install app": Chrome / Android / desktop Edge offer `beforeinstallprompt`, so the pill opens the browser's own
 * install dialog. Once installed (Android), the app appears in the share sheet, so photos and documents can be
 * shared straight to /share (src/app/manifest.ts). iOS Safari has no install API and cannot receive shares: it
 * gets a one-line tip instead. Hidden when already installed (display-mode: standalone) or unsupported.
 */

type BeforeInstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
type Mode = "prompt" | "ios" | "hidden";

// Chrome fires beforeinstallprompt once per page load, possibly before this component mounts, so the event is
// captured when the module loads and shared by every install button on the page.
let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    emit();
  });
}

function isStandalone(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function getMode(): Mode {
  if (isStandalone()) return "hidden";
  if (deferredPrompt) return "prompt";
  return isIos() ? "ios" : "hidden";
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const media = window.matchMedia("(display-mode: standalone)");
  media.addEventListener("change", listener);
  return () => {
    listeners.delete(listener);
    media.removeEventListener("change", listener);
  };
}

export function InstallAppButton({ className, iosTip = true }: { className?: string; iosTip?: boolean }) {
  const mode = useSyncExternalStore(subscribe, getMode, () => "hidden" as Mode);

  if (mode === "ios") {
    return iosTip ? (
      <p className={cn("flex items-start gap-2 text-sm text-muted-foreground", className)} data-testid="install-app-ios-tip">
        <Share className="mt-0.5 size-4 shrink-0 text-foreground" aria-hidden="true" />
        <span>Install on iPhone: tap Share, then Add to Home Screen. iPhone cannot share photos into the app, so use the Choose photo button.</span>
      </p>
    ) : null;
  }
  if (mode !== "prompt") return null;

  const install = async () => {
    const event = deferredPrompt;
    if (!event) return;
    await event.prompt();
    await event.userChoice.catch(() => null);
    // The event can be used once; Chrome fires a new one if the person may still install.
    deferredPrompt = null;
    emit();
  };

  return (
    <button
      type="button"
      onClick={install}
      className={cn(
        "inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-white px-4 text-sm font-semibold text-foreground transition-colors hover:bg-surface-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        className,
      )}
      data-testid="install-app"
    >
      <Download className="size-4 shrink-0 text-teal-strong" aria-hidden="true" />
      Install app
    </button>
  );
}
