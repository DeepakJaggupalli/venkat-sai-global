"use client";

import { Pause, Play, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";

/**
 * Re-renders the server page every `intervalMs` while the tab is visible (real-time view). Pausable
 * (WCAG 2.2.2), and announces the refresh time politely instead of on every tick.
 */
export function AutoRefresh({ intervalMs = 30_000, asOf }: { intervalMs?: number; asOf: string }) {
  const router = useRouter();
  const [paused, setPaused] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (paused) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") startTransition(() => router.refresh());
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [paused, intervalMs, router]);

  const time = new Date(asOf).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <p className="text-sm text-muted-foreground" aria-live="polite">
        Updated {time}
        {paused ? " · auto-refresh paused" : ` · refreshes every ${Math.round(intervalMs / 1000)} seconds`}
      </p>
      <Button type="button" variant="outline" size="sm" onClick={() => setPaused((p) => !p)} aria-pressed={paused}>
        {paused ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}
        {paused ? "Resume" : "Pause"}
      </Button>
      <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => startTransition(() => router.refresh())}>
        <RefreshCw className={pending ? "animate-spin motion-reduce:animate-none" : undefined} aria-hidden="true" />
        Refresh now
      </Button>
    </div>
  );
}
