"use client";

import { Bell, BellOff, Share } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { toast } from "sonner";

import { CONTACT_BUTTON_STYLES } from "@/components/public/requirements/contact-buttons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * "Get new job alerts on this phone" (Web Push, free). The browser's permission prompt only appears after the
 * person clicks "Turn on alerts". Hidden when alerts are not configured or the browser cannot receive them; on an
 * iPhone outside the home-screen app it explains "Add to Home Screen" first (iOS 16.4+). Without `publicKey` the
 * key is fetched from /api/v1/push/subscribe (for client-only places such as the CV confirmation).
 */

type Status = "loading" | "hidden" | "ios-install" | "denied" | "off" | "on";

const SUBSCRIBE_URL = "/api/v1/push/subscribe";

function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isStandalone(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function pushSupported(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.getRegistration("/");
  return (await registration?.pushManager.getSubscription()) ?? null;
}

async function resolveStatus(initialKey: string | null | undefined): Promise<{ status: Status; key: string | null }> {
  let key = initialKey ?? null;
  if (initialKey === undefined) {
    const res = await fetch(SUBSCRIBE_URL, { cache: "no-store" });
    key = res.ok ? (((await res.json()) as { publicKey?: string | null }).publicKey ?? null) : null;
  }
  if (!key) return { status: "hidden", key: null };
  if (!pushSupported()) return { status: isIos() && !isStandalone() ? "ios-install" : "hidden", key };
  if (Notification.permission === "denied") return { status: "denied", key };
  return { status: (await currentSubscription()) ? "on" : "off", key };
}

export function JobAlertsButton({
  publicKey,
  countries = [],
  defaultCountry,
  defaultTrade,
  className,
}: {
  /** VAPID public key from the server; null = not configured; undefined = fetch it. */
  publicKey?: string | null;
  countries?: { code: string; name: string }[];
  defaultCountry?: string | null;
  defaultTrade?: string | null;
  className?: string;
}) {
  const id = useId();
  const [state, setState] = useState<{ status: Status; key: string | null }>({ status: "loading", key: null });
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trade, setTrade] = useState(defaultTrade?.trim().slice(0, 60) ?? "");
  const [country, setCountry] = useState(defaultCountry && countries.some((c) => c.code === defaultCountry) ? defaultCountry : "");

  useEffect(() => {
    let active = true;
    resolveStatus(publicKey)
      .then((next) => active && setState(next))
      .catch(() => active && setState({ status: "hidden", key: null }));
    return () => {
      active = false;
    };
  }, [publicKey]);

  const turnOn = async () => {
    if (!state.key || busy) return;
    setBusy(true);
    setError(null);
    try {
      // Asked first, directly in the click (iOS only allows the prompt from a user gesture).
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState((s) => ({ ...s, status: permission === "denied" ? "denied" : "off" }));
        return;
      }
      await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      const registration = await navigator.serviceWorker.ready;
      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(state.key) }));
      const res = await fetch(SUBSCRIBE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscription: subscription.toJSON(),
          topics: ["requirements"],
          trades: trade.trim().length >= 2 ? [trade.trim()] : [],
          countryCodes: country ? [country] : [],
          locale: "en",
        }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setState((s) => ({ ...s, status: "on" }));
      setOpen(false);
      toast.success("Job alerts are on for this phone.");
    } catch {
      setError("Could not turn on alerts. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  const turnOff = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const subscription = await currentSubscription();
      if (subscription) {
        await fetch("/api/v1/push/unsubscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: subscription.endpoint }) });
        await subscription.unsubscribe();
      }
      setState((s) => ({ ...s, status: "off" }));
      toast.success("Job alerts are off for this phone.");
    } catch {
      toast.error("Could not turn off alerts. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const { status } = state;
  if (status === "loading" || status === "hidden") return null;

  if (status === "ios-install") {
    return (
      <p className={cn("flex items-start gap-2 text-sm text-foreground", className)} data-testid="job-alerts-ios-tip">
        <Share className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>
          New job alerts on iPhone: tap Share, then Add to Home Screen. Open Venkat Sai Global from your home screen and tap the alerts button there (iOS 16.4 or
          later).
        </span>
      </p>
    );
  }

  if (status === "denied") {
    return (
      <p className={cn("flex items-start gap-2 text-sm text-muted-foreground", className)} data-testid="job-alerts-blocked">
        <BellOff className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>Notifications are blocked for this site. To get job alerts, allow notifications in your browser settings.</span>
      </p>
    );
  }

  if (status === "on") {
    return (
      <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-foreground", className)} data-testid="job-alerts-on">
        <Bell className="size-4 text-teal-strong" aria-hidden="true" />
        <span>New job alerts are on for this phone.</span>
        <button type="button" onClick={turnOff} disabled={busy} className="font-medium text-teal-strong underline underline-offset-4 disabled:opacity-60">
          Turn off
        </button>
      </div>
    );
  }

  return (
    <div className={cn("w-full sm:w-auto", className)} data-testid="job-alerts">
      <button type="button" className={cn(CONTACT_BUTTON_STYLES.outline, "w-full sm:w-auto")} aria-expanded={open} aria-controls={`${id}-panel`} onClick={() => setOpen((v) => !v)}>
        <Bell aria-hidden="true" className="size-4" />
        Get new job alerts on this phone
      </button>
      {open ? (
        <div id={`${id}-panel`} className="mt-3 max-w-md rounded-2xl border border-border bg-white p-4 text-left shadow-card sm:p-5">
          <p className="text-sm leading-relaxed text-foreground">
            Free. We send a notification to this phone when a new requirement is posted. Choose a trade or country to get fewer alerts, or leave them empty
            for all.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor={`${id}-trade`}>Trade (optional)</Label>
              <Input id={`${id}-trade`} value={trade} maxLength={60} placeholder="Welder" autoComplete="off" onChange={(e) => setTrade(e.target.value)} />
            </div>
            {countries.length ? (
              <div className="grid gap-1.5">
                <Label htmlFor={`${id}-country`}>Country (optional)</Label>
                <select
                  id={`${id}-country`}
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  <option value="">All countries</option>
                  {countries.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
          </div>
          {error ? (
            <p role="alert" className="mt-3 text-sm text-danger-strong">
              {error}
            </p>
          ) : null}
          <Button type="button" className="mt-4 min-h-11 w-full sm:w-auto" onClick={turnOn} disabled={busy}>
            <Bell aria-hidden="true" />
            {busy ? "Turning on..." : "Turn on alerts"}
          </Button>
          <p className="mt-3 text-xs text-muted-foreground">Your browser will ask for permission. You can turn alerts off here at any time.</p>
        </div>
      ) : null}
    </div>
  );
}
