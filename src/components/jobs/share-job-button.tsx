"use client";

import { Check, Link2, Share2 } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { track } from "@/modules/analytics/client";

type ShareJobButtonProps = { jobId: string; title: string; url: string; className?: string };

const noopSubscribe = () => () => {};
const hasWebShare = () => typeof navigator !== "undefined" && typeof navigator.share === "function";

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the legacy path
  }
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.className = "fixed -left-[9999px] opacity-0";
    document.body.appendChild(area);
    area.select();
    const done = document.execCommand("copy");
    area.remove();
    return done;
  } catch {
    return false;
  }
}

/**
 * Share a job: the system share sheet where available (phones), plus "Copy link" everywhere. The result
 * is announced politely; analytics records only the job id and the method.
 */
export function ShareJobButton({ jobId, title, url, className }: ShareJobButtonProps) {
  const t = useT("talent-jobs");
  const canShare = useSyncExternalStore(noopSubscribe, hasWebShare, () => false);
  const [copied, setCopied] = useState(false);
  const [status, setStatus] = useState("");
  const timer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, []);

  async function share() {
    try {
      await navigator.share({ title, text: t("share.text", { title }), url });
      track("job_shared", { jobId, method: "native" });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      await copy();
    }
  }

  async function copy() {
    const ok = await copyText(url);
    if (!ok) {
      toast.error(t("share.copyFailed"));
      return;
    }
    setCopied(true);
    setStatus(t("share.copied"));
    toast.success(t("share.copied"));
    track("job_shared", { jobId, method: "copy" });
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      setCopied(false);
      setStatus("");
    }, 2500);
  }

  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {canShare ? (
        <Button type="button" variant="outline" onClick={share} data-testid="share-job">
          <Share2 aria-hidden="true" />
          {t("share.button")}
        </Button>
      ) : null}
      <Button type="button" variant="outline" onClick={copy} data-testid="copy-job-link">
        {copied ? <Check aria-hidden="true" /> : <Link2 aria-hidden="true" />}
        {copied ? t("share.copiedShort") : t("share.copy")}
      </Button>
      <span className="sr-only" role="status" aria-live="polite">
        {status}
      </span>
    </div>
  );
}
