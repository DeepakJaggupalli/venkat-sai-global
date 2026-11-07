"use client";

import { useRouter } from "next/navigation";
import { useActionState, useRef, useState, type ReactNode } from "react";

import { FormErrorAlert, FormField, SubmitButton, useActionToast, type FieldControlProps } from "@/components/shared/form";
import { keepFormValues } from "@/components/shared/form/keep-values";
import { MultiCombobox } from "@/components/shared/multi-combobox";
import { RichTextEditor } from "@/components/shared/rich-text/rich-text-editor";
import { SearchableSelect, SimpleSelect } from "@/components/shared/selects";
import type { SelectOption } from "@/components/shared/types";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult, ActionState } from "@/lib/actions";
import { cn } from "@/lib/utils";

import { useCloseActionDialog } from "./action-dialog";

/**
 * Declarative Command Centre form. Server pages describe the fields (serialisable specs) and pass a
 * Server Action built with createFormAction; this component wires useActionState, inline field errors,
 * the form-level alert, the success toast and a refresh. Keeps dozens of small staff forms consistent.
 * React resets a `<form action>` after every submission; after a failed one the reset is cancelled so staff
 * keep what they typed next to the field errors. Successful submissions reset to the defaults as before.
 */
export type AdminFieldSpec = {
  name: string;
  label: string;
  kind?: "text" | "textarea" | "richtext" | "select" | "search-select" | "date" | "datetime-local" | "number" | "email" | "tel" | "checkbox" | "multi";
  required?: boolean;
  optional?: boolean;
  hint?: string;
  placeholder?: string;
  options?: SelectOption[];
  defaultValue?: string | number | boolean | null;
  rows?: number;
  min?: number;
  max?: number;
  step?: string;
  /** Span both columns in the two-column layout. */
  wide?: boolean;
  allowClear?: boolean;
  /** Selected values for kind "multi" (submitted as `name[]`). */
  defaultValues?: string[];
};

export type ActionFormProps<T> = {
  action: (prev: ActionState<T>, formData: FormData) => Promise<ActionResult<T>>;
  fields?: AdminFieldSpec[];
  hidden?: Record<string, string | number | boolean | null | undefined>;
  submitLabel: string;
  pendingLabel?: string;
  submitVariant?: "default" | "outline" | "destructive" | "secondary";
  /** Two-column grid on wider screens. */
  columns?: 1 | 2;
  resetOnSuccess?: boolean;
  /** Navigate here after success (e.g. a newly created record). `{id}` is replaced by `data.id`. */
  successHref?: string;
  intro?: ReactNode;
  className?: string;
  testId?: string;
};

export function ActionForm<T>({
  action,
  fields = [],
  hidden,
  submitLabel,
  pendingLabel = "Saving…",
  submitVariant = "default",
  columns = 1,
  resetOnSuccess = false,
  successHref,
  intro,
  className,
  testId,
}: ActionFormProps<T>) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction] = useActionState<ActionState<T>, FormData>(action, null);
  const closeDialog = useCloseActionDialog();
  useActionToast(state, {
    onSuccess: (result) => {
      if (resetOnSuccess) formRef.current?.reset();
      closeDialog?.();
      const data = (result as { data?: unknown } | null)?.data;
      const id = data && typeof data === "object" && "id" in data ? String((data as { id: unknown }).id) : null;
      if (successHref) router.push(id ? successHref.replace("{id}", id) : successHref);
      else router.refresh();
    },
  });

  const fieldLabels = Object.fromEntries(fields.map((f) => [f.name, f.label]));

  return (
    <form
      ref={formRef}
      action={formAction}
      // React commits the new state (this attribute) before it resets the form, so the handler sees the result.
      data-failed={state && !state.ok ? "true" : undefined}
      onResetCapture={(event) => {
        if (event.currentTarget.dataset.failed === "true") keepFormValues(event);
      }}
      noValidate
      className={cn("space-y-4", className)}
      data-testid={testId}
    >
      {intro}
      <FormErrorAlert state={state} fieldLabels={fields.length > 3 ? fieldLabels : undefined} />
      {hidden
        ? Object.entries(hidden).map(([name, value]) =>
            value === undefined || value === null ? null : <input key={name} type="hidden" name={name} value={String(value)} />,
          )
        : null}
      {fields.length ? (
        <div className={cn("grid gap-4", columns === 2 && "sm:grid-cols-2")}>
          {fields.map((spec) => (
            <div key={spec.name} className={cn(columns === 2 && (spec.wide || spec.kind === "textarea" || spec.kind === "richtext") && "sm:col-span-2")}>
              <AdminField spec={spec} state={state} />
            </div>
          ))}
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <SubmitButton variant={submitVariant} pendingLabel={pendingLabel}>
          {submitLabel}
        </SubmitButton>
      </div>
    </form>
  );
}

function AdminField<T>({ spec, state }: { spec: AdminFieldSpec; state: ActionState<T> }) {
  const kind = spec.kind ?? "text";
  const dv = spec.defaultValue;
  if (kind === "checkbox") {
    const id = `f-${spec.name}`;
    return (
      <div className="flex items-start gap-2.5">
        <Checkbox id={id} name={spec.name} value="true" defaultChecked={dv === true} />
        <div className="grid gap-1">
          <Label htmlFor={id} className="font-normal">
            {spec.label}
          </Label>
          {spec.hint ? <p className="text-xs text-muted-foreground">{spec.hint}</p> : null}
        </div>
      </div>
    );
  }
  return (
    <FormField label={spec.label} name={spec.name} required={spec.required} optional={spec.optional} hint={spec.hint} state={state}>
      {(field) => {
        const common = { ...field, placeholder: spec.placeholder };
        switch (kind) {
          case "textarea":
            return <Textarea {...common} rows={spec.rows ?? 3} defaultValue={dv == null ? undefined : String(dv)} />;
          case "select":
            return (
              <SimpleSelect
                {...field}
                options={spec.options ?? []}
                defaultValue={dv == null ? undefined : String(dv)}
                placeholder={spec.placeholder}
                allowClear={spec.allowClear}
              />
            );
          case "search-select":
            return (
              <SearchableSelect
                {...field}
                options={spec.options ?? []}
                defaultValue={dv == null ? undefined : String(dv)}
                placeholder={spec.placeholder}
                allowClear={spec.allowClear}
              />
            );
          case "multi":
            return (
              <MultiCombobox
                id={field.id}
                name={spec.name}
                options={spec.options ?? []}
                defaultValue={(spec.options ?? []).filter((o) => spec.defaultValues?.includes(o.value))}
                placeholder={spec.placeholder ?? "Choose…"}
                aria-describedby={field["aria-describedby"]}
                aria-invalid={field["aria-invalid"]}
              />
            );
          case "richtext":
            return (
              <RichTextEditor
                id={field.id}
                name={spec.name}
                defaultValue={dv == null ? undefined : String(dv)}
                aria-describedby={field["aria-describedby"]}
                aria-invalid={field["aria-invalid"]}
                minHeight="md"
              />
            );
          case "datetime-local":
            return <LocalDateTimeInput field={field} defaultIso={dv == null ? undefined : String(dv)} />;
          default:
            return (
              <Input
                {...common}
                type={kind}
                min={spec.min}
                max={spec.max}
                step={spec.step}
                defaultValue={dv == null ? undefined : String(dv)}
              />
            );
        }
      }}
    </FormField>
  );
}

/** ISO string -> value for <input type="datetime-local"> in the viewer's own time zone. */
function toLocalInput(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * datetime-local carries no zone, and the server runs in UTC. The visible input is unnamed; a hidden
 * input submits the instant as ISO 8601 so due dates mean what the staff member typed.
 */
function LocalDateTimeInput({ field, defaultIso }: { field: FieldControlProps; defaultIso?: string }) {
  const [local, setLocal] = useState(() => toLocalInput(defaultIso));
  const parsed = local ? new Date(local) : null;
  const iso = parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString() : "";
  const { name, ...rest } = field;
  return (
    <>
      <Input {...rest} type="datetime-local" value={local} onChange={(e) => setLocal(e.target.value)} />
      <input type="hidden" name={name} value={iso} />
    </>
  );
}
