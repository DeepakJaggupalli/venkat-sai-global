"use client";

import { useRef, useState, type MouseEvent } from "react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { buildShareText, whatsappShareHref } from "@/modules/recruitment-posters/share";

import { WhatsAppIcon } from "../contact-links";
import { CONTACT_BUTTON_STYLES } from "./contact-buttons";

/**
 * "Share to WhatsApp" for a requirement poster. On phones that can share files (Android Chrome) the poster image
 * itself goes to the share sheet with the title, short details and the apply link, so it arrives in WhatsApp as a
 * picture post (a chat, a group or the channel). Everywhere else it is a plain wa.me link with the same text,
 * where WhatsApp lets the person pick the chat or channel. Works without JavaScript (the link).
 */

function canShareFiles(): boolean {
  if (typeof navigator === "undefined" || typeof navigator.share !== "function" || typeof navigator.canShare !== "function") return false;
  try {
    return navigator.canShare({ files: [new File([""], "poster.jpg", { type: "image/jpeg" })] });
  } catch {
    return false;
  }
}

async function loadPosterFile(imageUrl: string, title: string): Promise<File> {
  const response = await fetch(imageUrl, { credentials: "same-origin" });
  if (!response.ok) throw new Error(`The poster image could not be loaded (${response.status}).`);
  const blob = await response.blob();
  const type = blob.type.startsWith("image/") ? blob.type : "image/jpeg";
  const ext = type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
  const base = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "requirement";
  return new File([blob], `${base}.${ext}`, { type });
}

const SMALL =
  "inline-flex min-h-10 items-center justify-center gap-1.5 rounded-full border border-border bg-white px-4 text-sm font-semibold text-foreground transition-colors duration-150 hover:border-[#c9cdd5] hover:bg-surface-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&_svg]:size-4 [&_svg]:shrink-0";

type ShareToWhatsAppProps = {
  /** Same-origin poster image URL (the one the page renders); null shares the text and link only. */
  imageUrl: string | null;
  title: string;
  /** Short details after the title, e.g. posterShareDetails(country, trades). */
  details?: string | null;
  /** Absolute public URL of the requirement. */
  url: string;
  label?: string;
  /** Accessible name when the visible label is short (e.g. "Share"). */
  ariaLabel?: string;
  size?: "md" | "sm";
  className?: string;
  testId?: string;
};

export function ShareToWhatsApp({ imageUrl, title, details, url, label = "Share to WhatsApp", ariaLabel, size = "md", className, testId = "share-whatsapp" }: ShareToWhatsAppProps) {
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<Promise<File> | null>(null);
  const text = buildShareText({ title, details, url });
  const href = whatsappShareHref(text);

  // Start downloading the poster when the person reaches for the button, so navigator.share() still runs within
  // the tap's user activation. Only on devices that can share files; a failed download is retried on the tap.
  const prefetch = (): Promise<File> | null => {
    if (!imageUrl || !canShareFiles()) return null;
    if (!fileRef.current) {
      const pending = loadPosterFile(imageUrl, title);
      fileRef.current = pending;
      pending.catch(() => {
        if (fileRef.current === pending) fileRef.current = null;
      });
    }
    return fileRef.current;
  };

  const openLink = () => window.open(href, "_blank", "noopener,noreferrer");

  const onClick = async (event: MouseEvent<HTMLAnchorElement>) => {
    const pending = prefetch();
    if (!pending) return; // no file sharing here: the link opens wa.me with the text
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const file = await pending;
      if (!navigator.canShare({ files: [file], text })) {
        openLink();
        return;
      }
      await navigator.share({ files: [file], text });
    } catch (error) {
      const name = error instanceof DOMException ? error.name : "";
      if (name === "AbortError") return; // the person closed the share sheet
      if (name === "NotAllowedError") {
        toast.info("The poster is ready. Tap share again to send it.");
        return;
      }
      toast.error("The poster could not be shared.", { action: { label: "Share the link", onClick: openLink } });
    } finally {
      setBusy(false);
    }
  };

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onPointerDown={() => void prefetch()}
      onFocus={() => void prefetch()}
      onClick={onClick}
      aria-label={ariaLabel}
      aria-busy={busy || undefined}
      className={cn(size === "sm" ? SMALL : CONTACT_BUTTON_STYLES.whatsapp, busy && "opacity-70", className)}
      data-testid={testId}
    >
      <WhatsAppIcon className="text-green-strong" />
      <span>{label}</span>
      {ariaLabel ? null : <span className="sr-only"> (opens WhatsApp or the share menu)</span>}
    </a>
  );
}
