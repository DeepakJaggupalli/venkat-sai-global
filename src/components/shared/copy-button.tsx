"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type CopyButtonProps = {
  value: string;
  /** What is being copied, used in the accessible name: "Copy verification code". */
  label?: string;
  /** Show the label text next to the icon. */
  showLabel?: boolean;
  size?: "icon-xs" | "icon-sm" | "sm";
  variant?: "ghost" | "outline";
  onCopied?: () => void;
  className?: string;
};

async function writeClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the legacy path (insecure contexts, denied permission).
  }
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

/**
 * Copies a value to the clipboard with visible and announced confirmation.
 *
 *   <CopyButton value={certificate.verificationCode} label="verification code" />
 */
export function CopyButton({ value, label = "value", showLabel = false, size = "icon-sm", variant = "ghost", onCopied, className }: CopyButtonProps) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );

  const copy = async () => {
    const ok = await writeClipboard(value);
    setStatus(ok ? "copied" : "failed");
    if (ok) onCopied?.();
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setStatus("idle"), 2000);
  };

  const actionText = `Copy ${label}`;
  const iconOnly = size !== "sm" || !showLabel;
  const button = (
    <Button
      type="button"
      variant={variant}
      size={iconOnly ? size === "sm" ? "icon-sm" : size : "sm"}
      onClick={copy}
      aria-label={iconOnly ? actionText : undefined}
      className={cn(status === "copied" && "text-teal-strong", className)}
    >
      {status === "copied" ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
      {!iconOnly ? <span>{status === "copied" ? "Copied" : actionText}</span> : null}
    </Button>
  );

  return (
    <>
      {iconOnly ? (
        <Tooltip>
          <TooltipTrigger asChild>{button}</TooltipTrigger>
          <TooltipContent>{status === "copied" ? "Copied" : status === "failed" ? "Copy failed" : actionText}</TooltipContent>
        </Tooltip>
      ) : (
        button
      )}
      <span role="status" className="sr-only">
        {status === "copied" ? `${label} copied to clipboard` : status === "failed" ? "Could not copy. Select the text and copy it manually." : ""}
      </span>
    </>
  );
}
