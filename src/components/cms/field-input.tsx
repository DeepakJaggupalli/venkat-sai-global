"use client";

import { ChevronDown, Lock, Plus, Trash2 } from "lucide-react";
import { useId, useState } from "react";

import { FormField, type FieldControlProps } from "@/components/shared/form";
import { MultiCombobox } from "@/components/shared/multi-combobox";
import { RichTextEditor } from "@/components/shared/rich-text/rich-text-editor";
import { SearchableSelect, SimpleSelect } from "@/components/shared/selects";
import type { SelectOption } from "@/components/shared/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import { AssetField } from "./asset-field";
import { useCmsEditor } from "./editor-context";
import { type EditorField, countErrorsUnder, emptyObjectFor, errorsAt, listItemTitle, moveItem, pathKey, toDatetimeLocal, fromDatetimeLocal, type Path } from "./field-utils";
import { SortableRows } from "./sortable-rows";

type FieldInputProps = {
  field: EditorField;
  value: unknown;
  onChange: (value: unknown) => void;
  /** Path of the value inside `data` (errors are keyed "data.<path>"). */
  path: Path;
};

const URL_HINTS: Record<string, string> = {
  video: "A YouTube or Vimeo link. It is converted to a privacy-friendly player link when saved.",
  map: "Google Maps → Share → Embed a map → copy the link inside src=\"…\", or an OpenStreetMap embed link.",
};

function hintFor(field: EditorField): string | undefined {
  const parts: string[] = [];
  if (field.help) parts.push(field.help);
  if (field.type === "url" && field.urlKind && URL_HINTS[field.urlKind]) parts.push(URL_HINTS[field.urlKind]!);
  if (field.type === "url" && field.allowRelative && !field.urlKind) parts.push("A page on this site (starting with /) or a full https:// link.");
  if (field.internal) parts.push("Internal: only staff see this. It is never shown on the website.");
  return parts.length ? parts.join(" ") : undefined;
}

function str(value: unknown): string {
  return typeof value === "string" ? value : typeof value === "number" ? String(value) : "";
}

function arr(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

function toOptions(values: string[], options: SelectOption[]): SelectOption[] {
  const map = new Map(options.map((o) => [o.value, o]));
  return values.map((v) => map.get(v) ?? { value: v, label: "Unavailable item" });
}

/** Renders one field descriptor (recursively for groups and lists). */
export function FieldInput({ field, value, onChange, path }: FieldInputProps) {
  const editor = useCmsEditor();
  const errorKey = `data.${pathKey(path)}`;
  const errors = errorsAt(editor.errors, errorKey);
  const label = (
    <span className="inline-flex items-center gap-1.5">
      {field.label}
      {field.internal && (
        <Badge variant="outline" className="gap-1 text-[0.7rem] font-normal">
          <Lock className="size-3" aria-hidden />
          Internal
        </Badge>
      )}
    </span>
  );
  const common = { label, required: field.required, hint: hintFor(field), errors };
  const disabled = editor.disabled;

  switch (field.type) {
    case "group":
      return <GroupField field={field} value={value} onChange={onChange} path={path} />;
    case "list":
      return <ListField field={field} value={value} onChange={onChange} path={path} />;
    case "textlist":
      return (
        <FormField {...common}>
          {(control) => <TextListInput control={control} label={field.label} value={arr(value)} onChange={onChange} maxItems={field.maxItems} maxLength={field.maxLength} disabled={disabled} />}
        </FormField>
      );
    case "text":
    case "email":
    case "phone":
    case "url":
      return (
        <FormField {...common}>
          <Input
            type={field.type === "email" ? "email" : field.type === "phone" ? "tel" : field.type === "url" && !field.allowRelative ? "url" : "text"}
            inputMode={field.type === "url" ? "url" : field.type === "phone" ? "tel" : undefined}
            value={str(value)}
            maxLength={field.type === "text" ? field.maxLength : 2000}
            placeholder={field.placeholder}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.value)}
          />
        </FormField>
      );
    case "textarea":
      return (
        <FormField {...common}>
          <Textarea value={str(value)} rows={field.rows ?? 4} maxLength={field.maxLength} placeholder={field.placeholder} disabled={disabled} onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.value)} />
        </FormField>
      );
    case "richtext":
      return (
        <FormField {...common}>
          {(control) => (
            <RichTextEditor
              {...control}
              name={`cms-rich-${pathKey(path)}`}
              defaultValue={str(value)}
              maxLength={field.maxLength}
              placeholder={field.placeholder}
              disabled={disabled}
              aria-labelledby={`${control.id}-label`}
              onChange={(html) => onChange(html === "<p></p>" || html === "" ? undefined : html)}
            />
          )}
        </FormField>
      );
    case "number":
      return (
        <FormField {...common}>
          <Input
            type="number"
            inputMode={field.integer ? "numeric" : "decimal"}
            min={field.min}
            max={field.max}
            step={field.integer ? 1 : "any"}
            value={typeof value === "number" ? String(value) : ""}
            disabled={disabled}
            onChange={(e) => {
              const n = e.target.value === "" ? undefined : Number(e.target.value);
              onChange(n === undefined || Number.isNaN(n) ? undefined : n);
            }}
          />
        </FormField>
      );
    case "boolean":
      return <BooleanInput field={field} value={value} onChange={onChange} errors={errors} disabled={disabled} />;
    case "date":
      return (
        <FormField {...common}>
          <Input type="date" value={str(value)} disabled={disabled} onChange={(e) => onChange(e.target.value || undefined)} className="sm:max-w-56" />
        </FormField>
      );
    case "datetime":
      return (
        <FormField {...common} hint={[hintFor(field), "Your local time."].filter(Boolean).join(" ")}>
          <Input type="datetime-local"
            suppressHydrationWarning value={toDatetimeLocal(str(value) || null)} disabled={disabled} onChange={(e) => onChange(fromDatetimeLocal(e.target.value))} className="sm:max-w-64" />
        </FormField>
      );
    case "select":
      return (
        <FormField {...common}>
          {(control) => (
            <SimpleSelect
              {...control}
              options={[...field.options]}
              value={str(value)}
              onValueChange={(v) => onChange(v || undefined)}
              allowClear={!field.required}
              clearLabel="None"
              placeholder="Choose…"
              disabled={disabled}
            />
          )}
        </FormField>
      );
    case "multiselect":
      return <MultiSelectInput field={field} value={arr(value)} onChange={onChange} common={common} disabled={disabled} />;
    case "asset":
    case "assets":
      return (
        <FormField {...common}>
          {(control) => (
            <AssetField
              id={control.id}
              aria-describedby={control["aria-describedby"]}
              aria-invalid={control["aria-invalid"]}
              label={field.label}
              value={field.type === "assets" ? arr(value) : str(value) || undefined}
              onChange={onChange}
              multiple={field.type === "assets"}
              kinds={field.kinds}
              maxItems={field.type === "assets" ? field.maxItems : 1}
              assets={editor.assets}
              rememberAssets={editor.rememberAssets}
              canUpload={editor.canUpload}
              disabled={disabled}
            />
          )}
        </FormField>
      );
    case "reference":
    case "country": {
      const options =
        field.type === "country"
          ? editor.countryOptions
          : field.target.kind === "collection"
            ? (editor.referenceOptions[field.target.collection] ?? [])
            : (editor.taxonomyOptions[field.target.taxonomy] ?? []);
      const empty = field.type === "reference" && field.target.kind === "collection" ? "No entries yet. Create them in their collection first." : "No matches.";
      if (field.multiple) {
        return (
          <FormField {...common}>
            {(control) => (
              <MultiCombobox
                {...control}
                options={options}
                value={toOptions(arr(value), options)}
                onChange={(sel) => onChange(sel.map((o) => o.value))}
                maxSelected={field.maxItems}
                emptyText={empty}
                placeholder="Choose…"
                disabled={disabled}
              />
            )}
          </FormField>
        );
      }
      return (
        <FormField {...common}>
          {(control) => (
            <SearchableSelect
              {...control}
              options={options}
              value={str(value)}
              onValueChange={(v) => onChange(v || undefined)}
              allowClear={!field.required}
              clearLabel="None"
              placeholder="Choose…"
              disabled={disabled}
            />
          )}
        </FormField>
      );
    }
    default:
      return null;
  }
}

function BooleanInput({ field, value, onChange, errors, disabled }: { field: EditorField; value: unknown; onChange: (v: unknown) => void; errors?: string[]; disabled: boolean }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const checked = typeof value === "boolean" ? value : field.type === "boolean" ? (field.defaultValue ?? false) : false;
  const hint = hintFor(field);
  return (
    <div className="space-y-1">
      <div className="flex items-start gap-3">
        <Switch id={`b-${id}`} checked={checked} onCheckedChange={(v) => onChange(v)} disabled={disabled} aria-describedby={hint ? `b-${id}-hint` : undefined} aria-invalid={errors ? true : undefined} />
        <Label htmlFor={`b-${id}`} className="font-normal leading-snug">
          {field.label}
        </Label>
      </div>
      {hint && (
        <p id={`b-${id}-hint`} className="pl-12 text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {errors?.map((e) => (
        <p key={e} className="pl-12 text-sm text-danger-strong">
          {e}
        </p>
      ))}
    </div>
  );
}

function MultiSelectInput({
  field,
  value,
  onChange,
  common,
  disabled,
}: {
  field: EditorField;
  value: string[];
  onChange: (v: unknown) => void;
  common: { label: React.ReactNode; required: boolean; hint?: string; errors?: string[] };
  disabled: boolean;
}) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  if (field.type !== "multiselect") return null;
  const options = [...field.options];
  if (options.length > 8) {
    return (
      <FormField {...common}>
        {(control) => <MultiCombobox {...control} options={options} value={toOptions(value, options)} onChange={(sel) => onChange(sel.map((o) => o.value))} maxSelected={field.maxItems} disabled={disabled} />}
      </FormField>
    );
  }
  const toggle = (v: string, on: boolean) => onChange(on ? [...value, v] : value.filter((x) => x !== v));
  return (
    <fieldset className="space-y-2" aria-describedby={common.hint ? `ms-${id}-hint` : undefined}>
      <legend className="text-sm font-medium">
        {common.label}
        {common.required && <span className="ml-0.5 text-danger-strong" aria-hidden>*</span>}
      </legend>
      {common.hint && (
        <p id={`ms-${id}-hint`} className="text-xs text-muted-foreground">
          {common.hint}
        </p>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((o) => (
          <div key={o.value} className="flex items-center gap-2">
            <Checkbox id={`ms-${id}-${o.value}`} checked={value.includes(o.value)} disabled={disabled} onCheckedChange={(v) => toggle(o.value, v === true)} />
            <Label htmlFor={`ms-${id}-${o.value}`} className="font-normal">
              {o.label}
            </Label>
          </div>
        ))}
      </div>
      {common.errors?.map((e) => (
        <p key={e} className="text-sm text-danger-strong">
          {e}
        </p>
      ))}
    </fieldset>
  );
}

function TextListInput({
  control,
  label,
  value,
  onChange,
  maxItems,
  maxLength,
  disabled,
}: {
  control: FieldControlProps;
  label: string;
  value: string[];
  onChange: (v: unknown) => void;
  maxItems?: number;
  maxLength?: number;
  disabled: boolean;
}) {
  const keys = useStableKeys(value.length);
  const atMax = maxItems !== undefined && value.length >= maxItems;
  return (
    <div id={control.id} role="group" aria-describedby={control["aria-describedby"]} className="space-y-2">
      {value.length > 0 && (
        <SortableRows
          ids={keys.ids}
          labels={value.map((v, i) => v || `Line ${i + 1}`)}
          listLabel={label}
          disabled={disabled}
          onMove={(from, to) => {
            keys.move(from, to);
            onChange(moveItem(value, from, to));
          }}
          renderRow={(index, c) => (
            <div className="flex items-center gap-1">
              {c.handle}
              <Input
                aria-label={`${label}, line ${index + 1}`}
                value={value[index] ?? ""}
                maxLength={maxLength}
                disabled={disabled}
                onChange={(e) => onChange(value.map((v, i) => (i === index ? e.target.value : v)))}
              />
              <span className="hidden sm:flex">{c.moveButtons}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                disabled={disabled}
                aria-label={`Remove line ${index + 1} from ${label}`}
                onClick={() => {
                  keys.remove(index);
                  onChange(value.filter((_, i) => i !== index));
                }}
              >
                <Trash2 aria-hidden />
              </Button>
            </div>
          )}
        />
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled || atMax}
        onClick={() => {
          keys.add();
          onChange([...value, ""]);
        }}
      >
        <Plus aria-hidden />
        Add line<span className="sr-only"> to {label}</span>
      </Button>
      {atMax && <p className="text-xs text-muted-foreground">Maximum of {maxItems} lines reached.</p>}
    </div>
  );
}

/** Stable React keys for rows of a JSON array that has no ids of its own. */
function useStableKeys(length: number) {
  // useId keeps server and client keys identical (they appear in aria-controls ids).
  const prefix = useId().replace(/[^a-zA-Z0-9]/g, "");
  const [state, setState] = useState(() => ({ ids: Array.from({ length }, (_, i) => `${prefix}-${i}`), next: length }));
  let current = state.ids;
  if (state.ids.length !== length) {
    // External change (reset / rollback): rebuild the keys.
    const extra = Array.from({ length: Math.max(0, length - state.ids.length) }, (_, i) => `${prefix}-${state.next + i}`);
    current = state.ids.length < length ? [...state.ids, ...extra] : state.ids.slice(0, length);
    setState({ ids: current, next: state.next + extra.length });
  }
  return {
    ids: current,
    add: () => {
      const key = `${prefix}-${state.next}`;
      setState((s) => ({ ids: [...s.ids, key], next: s.next + 1 }));
      return key;
    },
    remove: (index: number) => setState((s) => ({ ...s, ids: s.ids.filter((_, i) => i !== index) })),
    move: (from: number, to: number) => setState((s) => ({ ...s, ids: moveItem(s.ids, from, to) })),
  };
}

function GroupField({ field, value, onChange, path }: FieldInputProps) {
  const editor = useCmsEditor();
  const obj = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const errors = errorsAt(editor.errors, `data.${pathKey(path)}`);
  return (
    <fieldset className="space-y-4 rounded-lg border border-border/80 bg-surface-subtle/50 p-4">
      <legend className="px-1 font-heading text-sm font-semibold text-foreground">
        {field.label}
        {field.required && <span className="ml-0.5 text-danger-strong" aria-hidden>*</span>}
      </legend>
      {field.help && <p className="text-xs text-muted-foreground">{field.help}</p>}
      {errors?.map((e) => (
        <p key={e} className="text-sm text-danger-strong">
          {e}
        </p>
      ))}
      {(field.fields ?? []).map((sub) => (
        <FieldInput
          key={sub.name}
          field={sub}
          value={obj[sub.name]}
          path={[...path, sub.name]}
          onChange={(v) => {
            const next = { ...obj };
            if (v === undefined) delete next[sub.name];
            else next[sub.name] = v;
            onChange(next);
          }}
        />
      ))}
    </fieldset>
  );
}

function ListField({ field, value, onChange, path }: FieldInputProps) {
  const editor = useCmsEditor();
  const items = Array.isArray(value) ? (value as unknown[]) : [];
  const keys = useStableKeys(items.length);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(items.length <= 3 ? keys.ids : []));
  const max = field.type === "list" ? field.maxItems : undefined;
  const itemLabel = field.type === "list" ? field.itemLabel : "Item";
  const errorKey = `data.${pathKey(path)}`;
  const listErrors = errorsAt(editor.errors, errorKey);
  const labels = items.map((item, i) => listItemTitle(item, field, i));
  const disabled = editor.disabled;
  const atMax = max !== undefined && items.length >= max;

  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <fieldset className="space-y-3">
      <legend className="font-heading text-sm font-semibold text-foreground">
        {field.label}
        {field.required && <span className="ml-0.5 text-danger-strong" aria-hidden>*</span>}
        <span className="ml-2 text-xs font-normal text-muted-foreground">
          {items.length} {items.length === 1 ? itemLabel.toLowerCase() : `${itemLabel.toLowerCase()}s`}
          {max ? ` (max ${max})` : ""}
        </span>
      </legend>
      {field.help && <p className="text-xs text-muted-foreground">{field.help}</p>}
      {listErrors?.map((e) => (
        <p key={e} className="text-sm text-danger-strong" role="alert">
          {e}
        </p>
      ))}
      {items.length > 0 && (
        <SortableRows
          ids={keys.ids}
          labels={labels}
          listLabel={field.label}
          disabled={disabled}
          onMove={(from, to) => {
            keys.move(from, to);
            onChange(moveItem(items, from, to));
          }}
          renderRow={(index, c) => {
            const key = keys.ids[index]!;
            const open = expanded.has(key);
            const rowErrors = countErrorsUnder(editor.errors, `${errorKey}.${index}`);
            const item = items[index] && typeof items[index] === "object" ? (items[index] as Record<string, unknown>) : {};
            const panelId = `${key}-panel`;
            return (
              <div className={cn("rounded-lg border bg-card", rowErrors > 0 && "border-danger")}>
                <div className="flex items-center gap-1 p-2">
                  {c.handle}
                  <button
                    type="button"
                    className="flex min-h-7 min-w-0 flex-1 items-center gap-2 rounded-md px-1 text-left text-sm font-medium focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    aria-expanded={open}
                    aria-controls={panelId}
                    onClick={() => toggle(key)}
                  >
                    <ChevronDown className={cn("size-4 shrink-0 transition-transform", !open && "-rotate-90")} aria-hidden />
                    <span className="truncate">{labels[index]}</span>
                    {rowErrors > 0 && (
                      <span className="shrink-0 rounded-full bg-danger-soft px-2 text-xs text-danger-strong">
                        {rowErrors} {rowErrors === 1 ? "issue" : "issues"}
                      </span>
                    )}
                  </button>
                  {c.moveButtons}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    disabled={disabled}
                    aria-label={`Remove ${labels[index]}`}
                    onClick={() => {
                      keys.remove(index);
                      onChange(items.filter((_, i) => i !== index));
                    }}
                  >
                    <Trash2 aria-hidden />
                  </Button>
                </div>
                <div id={panelId} hidden={!open} className="space-y-4 border-t p-4">
                  {open &&
                    (field.fields ?? []).map((sub) => (
                      <FieldInput
                        key={sub.name}
                        field={sub}
                        value={item[sub.name]}
                        path={[...path, index, sub.name]}
                        onChange={(v) => {
                          const nextItem = { ...item };
                          if (v === undefined) delete nextItem[sub.name];
                          else nextItem[sub.name] = v;
                          onChange(items.map((it, i) => (i === index ? nextItem : it)));
                        }}
                      />
                    ))}
                </div>
              </div>
            );
          }}
        />
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled || atMax}
        onClick={() => {
          const key = keys.add();
          onChange([...items, emptyObjectFor(field.fields ?? [])]);
          // Open the new row so it can be filled in straight away.
          setExpanded((prev) => new Set(prev).add(key));
        }}
      >
        <Plus aria-hidden />
        Add {itemLabel.toLowerCase()}
        <span className="sr-only"> to {field.label}</span>
      </Button>
    </fieldset>
  );
}
