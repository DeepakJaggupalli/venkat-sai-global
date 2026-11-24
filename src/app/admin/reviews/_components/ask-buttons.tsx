"use client";

import { Check, Link2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";

import { WhatsAppIcon } from "@/components/public/contact-links";
import { cn } from "@/lib/utils";

import { recordReviewRequestAction } from "../actions";

const PILL =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 text-[15px] font-semibold transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&_svg]:size-5 [&_svg]:shrink-0 disabled:opacity-70";

async function writeClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Insecure context or permission denied: fall back below.
  }
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const done = document.execCommand("copy");
    document.body.removeChild(area);
    return done;
  } catch {
    return false;
  }
}

/**
 * "Send on WhatsApp" (wa.me to the worker's own number, message and review link prefilled; one tap, opens WhatsApp)
 * and "Copy link". Either one is recorded, so the list shows who asked and when.
 */
export function AskButtons({ submissionId, name, whatsappUrl, reviewUrl }: { submissionId: string; name: string; whatsappUrl: string | null; reviewUrl: string }) {
  const router = useRouter();
  const inputId = useId();
  const [pending, start] = useTransition();
  const [copied, setCopied] = useState(false);
  const [showLink, setShowLink] = useState(false);

  const record = (channel: "whatsapp" | "link", announce: boolean) =>
    start(async () => {
      const result = await recordReviewRequestAction({ submissionId, channel });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      if (announce && result.message) toast.success(result.message);
      router.refresh();
    });

  const copy = async () => {
    const done = await writeClipboard(reviewUrl);
    setCopied(done);
    if (!done) {
      setShowLink(true);
      toast.message("Copy the link from the box below.");
    }
    record("link", done);
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {whatsappUrl ? (
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => record("whatsapp", false)}
            className={cn(PILL, "bg-foreground text-white hover:bg-[#26262b]")}
            data-testid="review-ask-whatsapp"
          >
            <WhatsAppIcon />
            Send on WhatsApp
            <span className="sr-only"> to {name} (opens WhatsApp)</span>
          </a>
        ) : null}
        <button type="button" onClick={copy} disabled={pending} className={cn(PILL, "border border-border bg-white text-foreground hover:bg-surface-subtle")} data-testid="review-ask-copy">
          {copied ? <Check aria-hidden="true" /> : <Link2 aria-hidden="true" />}
          {copied ? "Link copied" : "Copy link"}
          <span className="sr-only"> for {name}</span>
        </button>
      </div>
      {showLink ? (
        <div className="space-y-1">
          <label htmlFor={inputId} className="text-xs text-muted-foreground">
            Review link for {name}
          </label>
          <input
            id={inputId}
            readOnly
            value={reviewUrl}
            onFocus={(e) => e.currentTarget.select()}
            className="h-11 w-full rounded-md border border-input bg-surface-subtle px-2 font-mono text-xs text-foreground"
          />
        </div>
      ) : null}
    </div>
  );
}
