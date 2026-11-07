"use client";

import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from "react";

import type { ActionState } from "@/lib/actions";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

import { TONE_STYLES } from "../tones";
import { fieldErrorsFor } from "./action-result";

/** Props FormField wires onto its control. Spread them onto custom controls when using a render function. */
export type FieldControlProps = {
  id: string;
  name?: string;
  required?: boolean;
  "aria-invalid"?: true;
  "aria-describedby"?: string;
  "aria-required"?: true;
};

type FormFieldProps = {
  label: ReactNode;
  /** Field name: used to read `state.fieldErrors[name]` and passed to the control. */
  name?: string;
  /** Control id (auto-generated when omitted). */
  id?: string;
  /** Marks the field required (asterisk + `required`/`aria-required` on the control). */
  required?: boolean;
  /** Shows "(optional)" after the label. Use on forms where most fields are required. */
  optional?: boolean;
  hint?: ReactNode;
  /** Explicit errors (otherwise read from `state`). */
  errors?: string[];
  /** The `useActionState` result — errors for `name` are picked up automatically. */
  state?: ActionState<unknown>;
  /** A single control element (props are merged in) or a render function receiving the wiring. */
  children: ReactElement<Record<string, unknown>> | ((control: FieldControlProps) => ReactNode);
  /** Hide the label visually (still announced). */
  hideLabel?: boolean;
  className?: string;
  labels?: { optional?: string };
};

/**
 * Label + control + hint + errors, wired for assistive technology (htmlFor, aria-describedby,
 * aria-invalid). Built for the ActionResult contract from src/lib/actions.ts.
 *
 *   const [state, formAction] = useActionState(saveJob, null);
 *   <FormField label="Job title" name="title" required state={state} hint="Shown to candidates">
 *     <Input />
 *   </FormField>
 *
 *   // custom controls receive the wiring explicitly
 *   <FormField label="Country" name="countryCode" state={state}>
 *     {(field) => <CountrySelect {...field} options={countries} />}
 *   </FormField>
 */
export function FormField({ label, name, id, required, optional, hint, errors, state, children, hideLabel, className, labels }: FormFieldProps) {
  const autoId = useId();
  const controlId = id ?? `field-${autoId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const hintId = `${controlId}-hint`;
  const errorId = `${controlId}-error`;
  const messages = errors ?? fieldErrorsFor(state, name);
  const invalid = Boolean(messages && messages.length > 0);
  const describedBy = [hint ? hintId : null, invalid ? errorId : null].filter(Boolean).join(" ") || undefined;

  const control: FieldControlProps = {
    id: controlId,
    name,
    required: required || undefined,
    "aria-required": required ? true : undefined,
    "aria-invalid": invalid ? true : undefined,
    "aria-describedby": describedBy,
  };

  let rendered: ReactNode;
  if (typeof children === "function") {
    rendered = children(control);
  } else if (isValidElement(children)) {
    const own = children.props;
    const ownDescribedBy = typeof own["aria-describedby"] === "string" ? own["aria-describedby"] : undefined;
    rendered = cloneElement(children, {
      id: (own.id as string | undefined) ?? control.id,
      name: (own.name as string | undefined) ?? control.name,
      required: (own.required as boolean | undefined) ?? control.required,
      "aria-required": control["aria-required"],
      "aria-invalid": control["aria-invalid"],
      "aria-describedby": [ownDescribedBy, describedBy].filter(Boolean).join(" ") || undefined,
    });
  } else {
    rendered = children;
  }

  return (
    <div data-slot="form-field" data-field-name={name} data-invalid={invalid || undefined} className={cn("grid gap-1.5", className)}>
      {/* The label id lets non-labelable controls (rich text, custom widgets) use aria-labelledby. */}
      <Label id={`${controlId}-label`} htmlFor={controlId} className={cn("text-sm leading-snug font-medium text-foreground", hideLabel && "sr-only")}>
        {label}
        {required ? (
          // Screen readers get "required" from the control's required/aria-required attributes.
          <span aria-hidden="true" className={TONE_STYLES.danger.text}>
            *
          </span>
        ) : optional ? (
          <span className="font-normal text-muted-foreground">{labels?.optional ?? "(optional)"}</span>
        ) : null}
      </Label>
      {rendered}
      {hint ? (
        <p id={hintId} className="text-xs leading-relaxed text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {invalid && messages ? (
        <div id={errorId} className={cn("text-sm", TONE_STYLES.danger.text)}>
          {messages.length === 1 ? (
            <p>{messages[0]}</p>
          ) : (
            <ul className="list-disc space-y-0.5 pl-5">
              {messages.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
