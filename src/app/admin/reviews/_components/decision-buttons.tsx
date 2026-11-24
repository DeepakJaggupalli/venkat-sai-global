"use client";

import { Check, Eye, EyeOff, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition, type ReactNode } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { cn } from "@/lib/utils";
import type { WorkerReviewStatus } from "@/db/schema/worker-reviews";
import type { WorkerReviewDecision } from "@/modules/worker-reviews/schemas";

import { moderateWorkerReviewAction } from "../actions";

const PILL =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 text-[15px] font-semibold transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&_svg]:size-5 [&_svg]:shrink-0 aria-disabled:cursor-wait aria-disabled:opacity-70";
const DARK = `${PILL} bg-foreground text-white hover:bg-[#26262b]`;
const LIGHT = `${PILL} border border-border bg-white text-foreground hover:bg-surface-subtle`;

type ButtonSpec = { decision: WorkerReviewDecision; label: string; icon: ReactNode; dark?: boolean; confirm?: { title: string; description: string; confirmLabel: string; destructive?: boolean } };

/** The buttons a review shows in its current state (publishing ones only when the worker gave consent). */
function buttonsFor(status: WorkerReviewStatus, consentToPublish: boolean): ButtonSpec[] {
  const approve: ButtonSpec = { decision: "approve", label: "Approve", icon: <Check aria-hidden="true" />, dark: true };
  switch (status) {
    case "pending":
      return consentToPublish
        ? [
            approve,
            {
              decision: "reject",
              label: "Reject",
              icon: <X aria-hidden="true" />,
              confirm: {
                title: "Reject this review?",
                description: "It will not be shown on the website. You can still approve it later from the Not shown tab.",
                confirmLabel: "Reject",
                destructive: true,
              },
            },
          ]
        : [{ decision: "reject", label: "Done, keep private", icon: <Check aria-hidden="true" />, dark: true }];
    case "approved":
      return [
        {
          decision: "hide",
          label: "Hide from website",
          icon: <EyeOff aria-hidden="true" />,
          confirm: { title: "Hide this review?", description: "It disappears from the website at once. You can show it again later.", confirmLabel: "Hide", destructive: true },
        },
      ];
    case "hidden":
      return [{ decision: "unhide", label: "Show again", icon: <Eye aria-hidden="true" />, dark: true }];
    case "rejected":
      return consentToPublish ? [approve] : [];
  }
}

/** Approve / Reject / Hide / Show again, with large touch targets; Reject and Hide ask first. */
export function DecisionButtons({ id, status, consentToPublish, who }: { id: string; status: WorkerReviewStatus; consentToPublish: boolean; who: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const specs = buttonsFor(status, consentToPublish);
  if (!specs.length) return null;

  const run = (decision: WorkerReviewDecision) =>
    start(async () => {
      const result = await moderateWorkerReviewAction({ id, decision });
      if (result.ok) {
        toast.success(result.message ?? "Saved.");
        router.refresh();
      } else {
        toast.error(result.error);
        router.refresh();
      }
    });

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
      {specs.map((spec) =>
        spec.confirm ? (
          <ConfirmDialog
            key={spec.decision}
            trigger={
              <button type="button" className={spec.dark ? DARK : LIGHT} data-testid={`review-${spec.decision}`}>
                {spec.icon}
                {spec.label}
                <span className="sr-only"> (review by {who})</span>
              </button>
            }
            title={spec.confirm.title}
            description={spec.confirm.description}
            confirmLabel={spec.confirm.confirmLabel}
            variant={spec.confirm.destructive ? "destructive" : "default"}
            onConfirm={() => moderateWorkerReviewAction({ id, decision: spec.decision })}
            onSuccess={() => router.refresh()}
          />
        ) : (
          <button
            key={spec.decision}
            type="button"
            aria-disabled={pending || undefined}
            onClick={() => {
              if (!pending) run(spec.decision);
            }}
            className={cn(spec.dark ? DARK : LIGHT)}
            data-testid={`review-${spec.decision}`}
          >
            {spec.icon}
            {pending ? "Saving…" : spec.label}
            <span className="sr-only"> (review by {who})</span>
          </button>
        ),
      )}
    </div>
  );
}
