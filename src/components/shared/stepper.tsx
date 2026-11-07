import { Check } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";

export type StepperStep = {
  id: string;
  label: string;
  description?: string;
  /** Link to the step (only rendered for completed and current steps). */
  href?: string;
};

export type StepState = "complete" | "current" | "upcoming";

type StepperProps = {
  steps: StepperStep[];
  /** Current step id or zero-based index. */
  current: string | number;
  /** Explicitly completed step ids. Defaults to every step before the current one. */
  completed?: string[];
  orientation?: "horizontal" | "vertical";
  /** Accessible name, e.g. "Profile setup progress". */
  label?: string;
  className?: string;
};

/** Resolve each step's state (pure; exported for tests and custom renderers). */
export function resolveStepStates(steps: StepperStep[], current: string | number, completed?: string[]): StepState[] {
  const currentIndex = typeof current === "number" ? current : steps.findIndex((s) => s.id === current);
  const done = completed ? new Set(completed) : null;
  return steps.map((step, i) => {
    if (i === currentIndex) return "current";
    if (done ? done.has(step.id) : i < currentIndex) return "complete";
    return "upcoming";
  });
}

const STATE_TEXT: Record<StepState, string> = { complete: "completed", current: "current step", upcoming: "not started" };

/**
 * Wizard progress. Horizontal steppers collapse to "Step 2 of 5" with a progress bar on phones.
 *
 *   <Stepper label="Application" current="documents" steps={[{ id: "details", label: "Details" }, { id: "documents", label: "Documents" }, { id: "review", label: "Review" }]} />
 */
export function Stepper({ steps, current, completed, orientation = "horizontal", label = "Progress", className }: StepperProps) {
  const states = resolveStepStates(steps, current, completed);
  const currentIndex = Math.max(0, states.indexOf("current"));
  const currentStep = steps[currentIndex];
  const vertical = orientation === "vertical";

  return (
    <nav aria-label={label} data-slot="stepper" className={className}>
      {!vertical && currentStep ? (
        <div className="space-y-2 sm:hidden">
          <p className="text-sm">
            <span className="font-medium text-muted-foreground">
              Step {currentIndex + 1} of {steps.length}:
            </span>{" "}
            <span className="font-semibold text-foreground">{currentStep.label}</span>
          </p>
          <div aria-hidden="true" className="h-1.5 w-full overflow-hidden rounded-full bg-teal-soft">
            <svg className="block h-full w-full" preserveAspectRatio="none" viewBox="0 0 100 1">
              <rect width={((currentIndex + 1) / steps.length) * 100} height="1" className="fill-teal-strong" />
            </svg>
          </div>
        </div>
      ) : null}
      <ol className={cn(vertical ? "flex flex-col gap-0" : "hidden items-start gap-2 sm:flex")}>
        {steps.map((step, i) => {
          const state = states[i] ?? "upcoming";
          const isLast = i === steps.length - 1;
          const linkable = Boolean(step.href) && state !== "upcoming";
          const marker = (
            <span
              aria-hidden="true"
              className={cn(
                "flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold transition-colors",
                state === "complete" && "border-teal-strong bg-teal-strong text-white",
                state === "current" && "border-teal-strong bg-card text-teal-strong ring-4 ring-teal-soft",
                state === "upcoming" && "border-input bg-card text-muted-foreground",
              )}
            >
              {state === "complete" ? <Check className="size-3.5" strokeWidth={3} /> : i + 1}
            </span>
          );
          const text = (
            <span className="min-w-0">
              <span className={cn("block text-sm font-medium", state === "upcoming" ? "text-muted-foreground" : "text-foreground")}>{step.label}</span>
              {step.description ? <span className="mt-0.5 block text-xs text-muted-foreground">{step.description}</span> : null}
              <span className="sr-only"> ({STATE_TEXT[state]})</span>
            </span>
          );
          const content = (
            <>
              {marker}
              {text}
            </>
          );
          return (
            <li
              key={step.id}
              aria-current={state === "current" ? "step" : undefined}
              className={cn("relative flex min-w-0", vertical ? "gap-3 pb-6 last:pb-0" : "flex-1 flex-col gap-2")}
            >
              {!isLast ? (
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute",
                    vertical ? "top-8 bottom-1 left-[0.8125rem] w-0.5" : "top-3.5 right-0 left-9 h-0.5",
                    state === "complete" ? "bg-teal-strong" : "bg-border",
                  )}
                />
              ) : null}
              {linkable && step.href ? (
                <Link href={step.href} className={cn("group/step flex min-w-0 rounded-md", vertical ? "gap-3" : "flex-col gap-2")}>
                  {content}
                </Link>
              ) : (
                <div className={cn("flex min-w-0", vertical ? "gap-3" : "flex-col gap-2")}>{content}</div>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
