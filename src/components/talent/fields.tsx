"use client";

import { useId, type ReactNode } from "react";

import { fieldErrorsFor } from "@/components/shared/form";
import type { ActionState } from "@/lib/actions";
import { cn } from "@/lib/utils";

/**
 * Small, native form controls for People Portal forms. Native checkboxes post "on" (read by
 * `f.bool()`); checkbox groups post `name[]` so an empty group still clears the stored list.
 */

const BOX = "mt-0.5 size-4 shrink-0 rounded border-input accent-teal-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

export function CheckboxField({
  name,
  label,
  hint,
  defaultChecked,
  disabled,
  required,
  state,
  className,
}: {
  name: string;
  label: ReactNode;
  hint?: ReactNode;
  defaultChecked?: boolean;
  disabled?: boolean;
  required?: boolean;
  state?: ActionState<unknown>;
  className?: string;
}) {
  const id = useId();
  const errors = fieldErrorsFor(state, name);
  const invalid = Boolean(errors?.length);
  const describedBy = [hint ? `${id}-hint` : null, invalid ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cn("flex items-start gap-3", className)}>
      <input
        id={id}
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        disabled={disabled}
        required={required}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        className={BOX}
      />
      <div className="min-w-0 space-y-0.5">
        <label htmlFor={id} className={cn("text-sm font-medium leading-snug", disabled && "text-muted-foreground")}>
          {label}
        </label>
        {hint ? (
          <p id={`${id}-hint`} className="text-sm text-muted-foreground">
            {hint}
          </p>
        ) : null}
        {invalid ? (
          <p id={`${id}-error`} className="text-sm font-medium text-danger-strong">
            {errors!.join(" ")}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function CheckboxGroup({
  name,
  legend,
  hint,
  options,
  defaultValue = [],
  state,
  columns = 2,
  disabledValues = [],
}: {
  name: string;
  legend: ReactNode;
  hint?: ReactNode;
  options: { value: string; label: string; hint?: string }[];
  defaultValue?: readonly string[];
  state?: ActionState<unknown>;
  columns?: 1 | 2 | 3;
  disabledValues?: readonly string[];
}) {
  const id = useId();
  const errors = fieldErrorsFor(state, name);
  const invalid = Boolean(errors?.length);
  return (
    <fieldset className="space-y-2" aria-describedby={[hint ? `${id}-hint` : null, invalid ? `${id}-error` : null].filter(Boolean).join(" ") || undefined}>
      <legend className="text-sm font-medium">{legend}</legend>
      {hint ? (
        <p id={`${id}-hint`} className="text-sm text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {/* Keeps the key present when nothing is ticked, so the saved list is cleared. */}
      <input type="hidden" name={`${name}[]`} value="" />
      <div className={cn("grid gap-2", columns === 2 && "sm:grid-cols-2", columns === 3 && "sm:grid-cols-3")}>
        {options.map((option) => {
          const optionId = `${id}-${option.value}`;
          const disabled = disabledValues.includes(option.value);
          return (
            <label
              key={option.value}
              htmlFor={optionId}
              className={cn(
                "flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border bg-background p-3 text-sm transition-colors has-[:checked]:border-teal has-[:checked]:bg-teal-soft/40 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                disabled && "cursor-not-allowed opacity-60",
              )}
            >
              <input id={optionId} type="checkbox" name={`${name}[]`} value={option.value} defaultChecked={defaultValue.includes(option.value)} disabled={disabled} className={BOX} />
              <span className="min-w-0">
                <span className="font-medium">{option.label}</span>
                {option.hint ? <span className="mt-0.5 block text-muted-foreground">{option.hint}</span> : null}
              </span>
            </label>
          );
        })}
      </div>
      {invalid ? (
        <p id={`${id}-error`} className="text-sm font-medium text-danger-strong">
          {errors!.join(" ")}
        </p>
      ) : null}
    </fieldset>
  );
}

export function RadioCards({
  name,
  legend,
  hint,
  options,
  defaultValue,
  state,
}: {
  name: string;
  legend: ReactNode;
  hint?: ReactNode;
  options: { value: string; label: string; hint?: string }[];
  defaultValue?: string | null;
  state?: ActionState<unknown>;
}) {
  const id = useId();
  const errors = fieldErrorsFor(state, name);
  const invalid = Boolean(errors?.length);
  return (
    <fieldset className="space-y-2" aria-describedby={[hint ? `${id}-hint` : null, invalid ? `${id}-error` : null].filter(Boolean).join(" ") || undefined}>
      <legend className="text-sm font-medium">{legend}</legend>
      {hint ? (
        <p id={`${id}-hint`} className="text-sm text-muted-foreground">
          {hint}
        </p>
      ) : null}
      <div className="grid gap-2">
        {options.map((option) => {
          const optionId = `${id}-${option.value}`;
          return (
            <label
              key={option.value}
              htmlFor={optionId}
              className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border bg-background p-3 text-sm transition-colors has-[:checked]:border-teal has-[:checked]:bg-teal-soft/40 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
            >
              <input
                id={optionId}
                type="radio"
                name={name}
                value={option.value}
                defaultChecked={defaultValue === option.value}
                className="mt-0.5 size-4 shrink-0 accent-teal-strong"
              />
              <span className="min-w-0">
                <span className="font-medium">{option.label}</span>
                {option.hint ? <span className="mt-0.5 block text-muted-foreground">{option.hint}</span> : null}
              </span>
            </label>
          );
        })}
      </div>
      {invalid ? (
        <p id={`${id}-error`} className="text-sm font-medium text-danger-strong">
          {errors!.join(" ")}
        </p>
      ) : null}
    </fieldset>
  );
}

/** Two-column responsive grid for form fields. */
export function FieldGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("grid gap-4 sm:grid-cols-2", className)}>{children}</div>;
}
