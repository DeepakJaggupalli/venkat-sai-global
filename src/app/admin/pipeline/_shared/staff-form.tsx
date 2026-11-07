"use client";

import { useRouter } from "next/navigation";
import { useActionState, useRef, useState, type ReactNode } from "react";

import { FileUpload } from "@/components/files";
import { FormErrorAlert, FormField, SubmitButton, useActionToast } from "@/components/shared/form";
import { RichTextEditor } from "@/components/shared/rich-text/rich-text-editor";
import { SearchableSelect, SimpleSelect } from "@/components/shared/selects";
import { TagInput } from "@/components/shared/tag-input";
import type { SelectOption } from "@/components/shared/types";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { FilePurpose } from "@/db/schema/_constants";
import type { ActionResult, ActionState } from "@/lib/actions";
import { cn } from "@/lib/utils";
import type { FileSummary } from "@/modules/files/types";

/**
 * Declarative staff form for the recruitment areas of the Command Centre. Server pages describe the
 * fields as serialisable specs and pass a Server Action built with createFormAction. Extends the
 * plain field set with tags, rich text and file uploads, which recruitment and training forms need
 * (evidence, secure documents, syllabus text). Field errors render inline, the form-level alert
 * summarises them, success is toasted and the route refreshed (or navigated).
 */
export type StaffFieldSpec = {
  name: string;
  label: string;
  kind?:
    | "text"
    | "textarea"
    | "select"
    | "search-select"
    | "date"
    | "datetime-local"
    | "time"
    | "number"
    | "email"
    | "tel"
    | "url"
    | "checkbox"
    | "tags"
    | "richtext"
    | "file"
    | "files";
  required?: boolean;
  optional?: boolean;
  hint?: string;
  placeholder?: string;
  options?: SelectOption[];
  defaultValue?: string | number | boolean | null;
  defaultTags?: string[];
  defaultFiles?: FileSummary[];
  purpose?: FilePurpose;
  rows?: number;
  min?: number | string;
  max?: number | string;
  step?: string;
  maxLength?: number;
  wide?: boolean;
  allowClear?: boolean;
};

export type StaffFormProps<T> = {
  action: (prev: ActionState<T>, formData: FormData) => Promise<ActionResult<T>>;
  fields?: StaffFieldSpec[];
  hidden?: Record<string, string | number | boolean | null | undefined>;
  submitLabel: string;
  pendingLabel?: string;
  submitVariant?: "default" | "outline" | "destructive" | "secondary";
  columns?: 1 | 2;
  resetOnSuccess?: boolean;
  /** Navigate after success; `{id}` is replaced by `data.id`. */
  successHref?: string;
  /** Adds a hidden `browserTimeZone` field with the viewer's IANA zone (fallback for date-time inputs). */
  sendTimeZone?: boolean;
  intro?: ReactNode;
  className?: string;
  testId?: string;
  /** Client-only callback after success (e.g. close a dialog). */
  onSuccess?: () => void;
  /** Extra controls rendered inside the form before the fields (e.g. a server-rendered checkbox list). */
  children?: ReactNode;
};

export function StaffForm<T>({
  action,
  fields = [],
  hidden,
  submitLabel,
  pendingLabel = "Saving…",
  submitVariant = "default",
  columns = 1,
  resetOnSuccess = false,
  successHref,
  sendTimeZone = false,
  intro,
  className,
  testId,
  onSuccess,
  children,
}: StaffFormProps<T>) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [formKey, setFormKey] = useState(0);
  const [state, formAction] = useActionState<ActionState<T>, FormData>(action, null);

  useActionToast(state, {
    onSuccess: (result) => {
      if (resetOnSuccess) {
        formRef.current?.reset();
        setFormKey((k) => k + 1);
      }
      const data = (result as { data?: unknown } | null)?.data;
      const id = data && typeof data === "object" && "id" in data ? String((data as { id: unknown }).id) : null;
      onSuccess?.();
      if (successHref) router.push(id ? successHref.replace("{id}", id) : successHref);
      else router.refresh();
    },
  });

  const fieldLabels = Object.fromEntries(fields.map((f) => [f.name, f.label]));

  return (
    <form ref={formRef} action={formAction} noValidate className={cn("space-y-4", className)} data-testid={testId}>
      {intro}
      <FormErrorAlert state={state} fieldLabels={fields.length > 2 ? fieldLabels : undefined} />
      {hidden
        ? Object.entries(hidden).map(([name, value]) =>
            value === undefined || value === null ? null : <input key={name} type="hidden" name={name} value={String(value)} />,
          )
        : null}
      {sendTimeZone ? <input type="hidden" name="browserTimeZone" defaultValue="" ref={writeBrowserTimeZone} /> : null}
      {children}
      {fields.length ? (
        <div key={formKey} className={cn("grid gap-4", columns === 2 && "sm:grid-cols-2")}>
          {fields.map((spec) => (
            <div
              key={spec.name}
              className={cn(columns === 2 && (spec.wide || spec.kind === "textarea" || spec.kind === "richtext" || spec.kind === "files") && "sm:col-span-2")}
            >
              <StaffField spec={spec} state={state} />
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

/** Fills the hidden browser time-zone field on mount (DOM write, no re-render; empty during SSR). */
function writeBrowserTimeZone(el: HTMLInputElement | null) {
  if (!el) return;
  try {
    el.value = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
  } catch {
    el.value = "";
  }
}

function StaffField<T>({ spec, state }: { spec: StaffFieldSpec; state: ActionState<T> }) {
  const kind = spec.kind ?? "text";
  const dv = spec.defaultValue;
  const fieldErrors = state && state.ok === false ? state.fieldErrors : undefined;

  if (kind === "checkbox") {
    const id = `sf-${spec.name}`;
    const err = fieldErrors?.[spec.name]?.[0];
    return (
      <div className="flex items-start gap-2.5">
        <Checkbox id={id} name={spec.name} value="true" defaultChecked={dv === true} aria-describedby={err ? `${id}-error` : undefined} />
        <div className="grid gap-1">
          <Label htmlFor={id} className="font-normal">
            {spec.label}
          </Label>
          {spec.hint ? <p className="text-xs text-muted-foreground">{spec.hint}</p> : null}
          {err ? (
            <p id={`${id}-error`} className="text-xs text-danger-strong">
              {err}
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  if (kind === "file" || kind === "files") {
    const id = `sf-${spec.name}`;
    const err = fieldErrors?.[spec.name]?.[0] ?? fieldErrors?.[`${spec.name}.0`]?.[0];
    return (
      <div className="grid gap-1.5">
        <FileUpload
          id={id}
          purpose={spec.purpose ?? "other"}
          name={spec.name}
          multiple={kind === "files"}
          label={spec.label}
          description={spec.hint}
          defaultFiles={spec.defaultFiles}
          required={spec.required}
          invalid={!!err}
          errorId={err ? `${id}-error` : undefined}
        />
        {err ? (
          <p id={`${id}-error`} className="text-xs text-danger-strong">
            {err}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <FormField label={spec.label} name={spec.name} required={spec.required} optional={spec.optional} hint={spec.hint} state={state}>
      {(field) => {
        const common = { ...field, placeholder: spec.placeholder };
        switch (kind) {
          case "textarea":
            return <Textarea {...common} rows={spec.rows ?? 3} maxLength={spec.maxLength} defaultValue={dv == null ? undefined : String(dv)} />;
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
          case "tags":
            return <TagInput {...field} name={spec.name} defaultValue={spec.defaultTags} placeholder={spec.placeholder} />;
          case "richtext":
            return (
              <RichTextEditor
                {...field}
                name={spec.name}
                defaultValue={dv == null ? undefined : String(dv)}
                placeholder={spec.placeholder}
                maxLength={spec.maxLength}
              />
            );
          default:
            return (
              <Input
                {...common}
                type={kind}
                min={spec.min}
                max={spec.max}
                step={spec.step}
                maxLength={spec.maxLength}
                defaultValue={dv == null ? undefined : String(dv)}
              />
            );
        }
      }}
    </FormField>
  );
}
