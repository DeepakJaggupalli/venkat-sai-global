"use client";

import { Bookmark, BookmarkCheck } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { track } from "@/modules/analytics/client";
import { saveJobBookmarkAction, unsaveJobBookmarkAction } from "@/modules/jobs/actions";

type SaveJobButtonProps = {
  jobId: string;
  jobTitle: string;
  /** Saved state for a signed-in viewer (null when unknown / signed out). */
  initialSaved: boolean | null;
  signedIn: boolean;
  /** Where to come back to after signing in. */
  returnTo: string;
  /** icon: compact square button (cards); full: icon + text (detail pages). */
  variant?: "icon" | "full";
  className?: string;
  /** Called after a successful change (e.g. remove the card from the saved list). */
  onChange?: (saved: boolean) => void;
};

/**
 * Save / unsave a job (People Portal saved jobs). Signed-out visitors get a sign-in link that brings them
 * back to the same page. The pressed state is announced (aria-pressed) and confirmed with a toast.
 */
export function SaveJobButton({ jobId, jobTitle, initialSaved, signedIn, returnTo, variant = "icon", className, onChange }: SaveJobButtonProps) {
  const t = useT("talent-jobs");
  const [saved, setSaved] = useState(Boolean(initialSaved));
  const [pending, startTransition] = useTransition();
  const label = saved ? t("save.remove", { title: jobTitle }) : t("save.add", { title: jobTitle });

  if (!signedIn) {
    const href = `/sign-in?returnTo=${encodeURIComponent(returnTo)}`;
    return (
      <Button asChild variant="outline" size={variant === "icon" ? "icon" : "default"} className={cn("relative z-10 shrink-0", className)}>
        <Link href={href} aria-label={variant === "icon" ? t("save.signInToSave", { title: jobTitle }) : undefined} rel="nofollow">
          <Bookmark aria-hidden="true" />
          {variant === "full" ? <span>{t("save.signInShort")}</span> : null}
        </Link>
      </Button>
    );
  }

  function toggle() {
    if (pending) return;
    const next = !saved;
    startTransition(async () => {
      const result = next ? await saveJobBookmarkAction({ jobId }) : await unsaveJobBookmarkAction({ jobId });
      if (!result.ok) {
        toast.error(next ? t("save.errorSave") : t("save.errorRemove"));
        return;
      }
      setSaved(next);
      toast.success(next ? t("save.saved") : t("save.removed"));
      if (next) track("job_saved", { jobId });
      onChange?.(next);
    });
  }

  const Icon = saved ? BookmarkCheck : Bookmark;
  return (
    <Button
      type="button"
      variant={saved ? "secondary" : "outline"}
      size={variant === "icon" ? "icon" : "default"}
      onClick={toggle}
      aria-pressed={saved}
      aria-busy={pending || undefined}
      aria-label={variant === "icon" ? label : undefined}
      title={variant === "icon" ? label : undefined}
      className={cn("relative z-10 shrink-0", saved && "text-teal-strong", className)}
      data-testid="save-job"
    >
      <Icon aria-hidden="true" className={cn(saved && "fill-current")} />
      {variant === "full" ? <span>{saved ? t("save.savedShort") : t("save.short")}</span> : null}
    </Button>
  );
}
