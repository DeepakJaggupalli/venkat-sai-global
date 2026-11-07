import Link from "next/link";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { isLinkAction, type ActionSlot, type LinkAction } from "./types";

type ActionLinkProps = LinkAction & {
  size?: "default" | "sm" | "lg";
  className?: string;
};

/** A button-styled link (server-component friendly). External links open in a new tab safely. */
export function ActionLink({ label, href, icon, variant = "default", external, size = "default", className }: ActionLinkProps) {
  const content = (
    <>
      {icon ? (
        <span aria-hidden="true" className="contents" data-icon="inline-start">
          {icon}
        </span>
      ) : null}
      <span>{label}</span>
      {external ? <span className="sr-only"> (opens in a new tab)</span> : null}
    </>
  );
  return (
    <Button asChild variant={variant} size={size} className={className}>
      {external ? (
        <a href={href} target="_blank" rel="noopener noreferrer">
          {content}
        </a>
      ) : (
        <Link href={href}>{content}</Link>
      )}
    </Button>
  );
}

/** Render an `ActionSlot`: declarative link actions become ActionLinks, anything else renders as-is. */
export function renderActionSlot(
  slot: ActionSlot | undefined,
  defaults: { variant?: LinkAction["variant"]; size?: ActionLinkProps["size"]; className?: string } = {},
): ReactNode {
  if (slot === undefined || slot === null || slot === false) return null;
  if (isLinkAction(slot)) {
    return (
      <ActionLink
        {...slot}
        variant={slot.variant ?? defaults.variant}
        size={defaults.size}
        className={cn(defaults.className)}
      />
    );
  }
  return slot;
}
