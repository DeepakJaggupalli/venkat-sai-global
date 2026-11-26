import { Check, ShieldAlert, ShieldCheck } from "lucide-react";

import { PillLink } from "@/components/dashboard";
import { cn } from "@/lib/utils";

import type { VerificationPlan } from "../_lib/dashboard";

/**
 * Next step for an organisation that is not verified yet: where it stands (details, documents, review, verified)
 * and one clear button, plus what it can already do meanwhile. Shown instead of a wall of empty tiles.
 */
export function VerificationNextStep({ plan }: { plan: VerificationPlan }) {
  const Icon = plan.tone === "info" ? ShieldCheck : ShieldAlert;
  return (
    <section
      aria-labelledby="verification-next-title"
      data-slot="verification-next-step"
      data-tone={plan.tone}
      className={cn(
        "rounded-[22px] border bg-white p-5 shadow-card sm:p-6",
        plan.tone === "info" ? "border-border" : "border-[color:color-mix(in_oklab,var(--warning),white_55%)]",
      )}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-2xl [&_svg]:size-5",
            plan.tone === "info" ? "bg-accent-soft text-accent-text" : "bg-warning-soft text-warning-strong",
          )}
        >
          <Icon />
        </span>
        <div className="min-w-0">
          <p className="label-dot">Next step</p>
          <h2 id="verification-next-title" className="mt-1 font-heading text-xl font-bold text-balance text-foreground">
            {plan.title}
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-pretty text-muted-foreground sm:text-[15px]">{plan.description}</p>
        </div>
      </div>

      <ol className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Verification progress">
        {plan.steps.map((step, index) => (
          <li
            key={step.id}
            aria-current={step.state === "current" ? "step" : undefined}
            className={cn(
              "flex min-h-11 items-center gap-2 rounded-2xl border px-3 py-2 text-sm",
              step.state === "done" && "border-border bg-surface-subtle text-foreground",
              step.state === "current" && "border-accent-fill bg-white font-semibold text-foreground ring-1 ring-accent-fill",
              step.state === "todo" && "border-border bg-white text-muted-foreground",
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold tabular-nums",
                step.state === "done" ? "bg-accent-fill text-white" : step.state === "current" ? "bg-accent-soft text-accent-text" : "bg-surface-subtle text-muted-foreground",
              )}
            >
              {step.state === "done" ? <Check className="size-3.5" /> : index + 1}
            </span>
            <span className="min-w-0">
              {step.label}
              <span className="sr-only">{step.state === "done" ? " (done)" : step.state === "current" ? " (current step)" : " (to do)"}</span>
            </span>
          </li>
        ))}
      </ol>

      {plan.action || plan.secondary ? (
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {plan.action ? <PillLink action={{ ...plan.action, variant: "primary" }} /> : null}
          {plan.secondary ? <PillLink action={{ ...plan.secondary, variant: "secondary" }} arrow={false} /> : null}
        </div>
      ) : null}
    </section>
  );
}
