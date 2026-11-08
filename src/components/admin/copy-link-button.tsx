"use client";

import { Check, Link2, MessageCircle } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { whatsappHref } from "@/config/contact";
import type { ActionResult } from "@/lib/actions";

/**
 * Issues a fresh signed link through a bound Server Action, copies it to the clipboard and (when the candidate's
 * number is known to the viewer) offers to send it on WhatsApp. The link is shown so it can be copied by hand too.
 */
export function CopyLinkButton({
  action,
  label,
  whatsappPhone,
  whatsappMessage,
  testId,
}: {
  action: () => Promise<ActionResult<{ url: string; expiresAt: string }>>;
  label: string;
  whatsappPhone?: string | null;
  /** The link is appended after this text. */
  whatsappMessage?: string;
  testId?: string;
}) {
  const [pending, start] = useTransition();
  const [link, setLink] = useState<{ url: string; expiresAt: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const issue = () =>
    start(async () => {
      const result = await action();
      if (!result.ok || !result.data) {
        toast.error(result.ok ? "The link could not be created." : result.error);
        return;
      }
      setLink(result.data);
      try {
        await navigator.clipboard.writeText(result.data.url);
        setCopied(true);
        toast.success("Link copied. Paste it in WhatsApp or SMS.");
      } catch {
        setCopied(false);
        toast.success("Link created. Copy it from the box below.");
      }
    });

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={issue} disabled={pending} data-testid={testId}>
          {copied ? <Check aria-hidden="true" /> : <Link2 aria-hidden="true" />}
          {pending ? "Creating link…" : label}
        </Button>
        {link && whatsappPhone ? (
          <Button asChild size="sm">
            <a href={whatsappHref(`${whatsappMessage ?? ""} ${link.url}`.trim(), whatsappPhone)} target="_blank" rel="noopener noreferrer">
              <MessageCircle aria-hidden="true" />
              Send on WhatsApp
            </a>
          </Button>
        ) : null}
      </div>
      {link ? (
        <div className="space-y-1">
          <label className="sr-only" htmlFor={`${testId ?? "link"}-value`}>
            Link
          </label>
          <input
            id={`${testId ?? "link"}-value`}
            readOnly
            value={link.url}
            onFocus={(e) => e.currentTarget.select()}
            className="h-9 w-full rounded-md border border-input bg-surface-subtle px-2 font-mono text-xs text-foreground"
          />
          <p className="text-xs text-muted-foreground">
            Valid until {new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(link.expiresAt))} (India time).
          </p>
        </div>
      ) : null}
    </div>
  );
}
