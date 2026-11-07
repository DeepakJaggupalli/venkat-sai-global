"use client";

import { ChevronsUpDown } from "lucide-react";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

import { groupOptions } from "./filters/filter-utils";
import type { SelectOption } from "./types";

/** Radix Select items cannot hold "" — "no value" is represented by this sentinel internally. */
const NONE = "__none__";

type FieldAria = {
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean | "true" | "false";
  "aria-required"?: boolean | "true" | "false";
  "aria-label"?: string;
  required?: boolean;
};

type BaseSelectProps = FieldAria & {
  /** Form field name (a hidden input carries the value). */
  name?: string;
  /** Options are always passed from the server (taxonomy queries, enum labels). */
  options: SelectOption[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  /** Offer a "None" choice that clears the value. */
  allowClear?: boolean;
  clearLabel?: string;
  disabled?: boolean;
  className?: string;
};

function useControllableString(value: string | undefined, defaultValue: string | undefined, onChange?: (v: string) => void) {
  const [internal, setInternal] = useState(defaultValue ?? "");
  const current = value ?? internal;
  const set = (next: string) => {
    if (value === undefined) setInternal(next);
    onChange?.(next);
  };
  return [current, set] as const;
}

function isInvalid(value: FieldAria["aria-invalid"]): boolean {
  return value === true || value === "true";
}

/**
 * Native-feeling select for short option lists (Radix Select, typeahead by first letter).
 *
 *   <FormField label="Employment type" name="employmentType" required><SimpleSelect options={employmentTypeOptions} /></FormField>
 */
export function SimpleSelect({
  name,
  options,
  value,
  defaultValue,
  onValueChange,
  placeholder = "Select…",
  allowClear = false,
  clearLabel = "None",
  disabled,
  className,
  id,
  required,
  ...aria
}: BaseSelectProps) {
  const [current, setCurrent] = useControllableString(value, defaultValue, onValueChange);
  return (
    <>
      <Select value={current} onValueChange={(v) => setCurrent(v === NONE ? "" : v)} disabled={disabled}>
        <SelectTrigger
          id={id}
          aria-label={aria["aria-label"]}
          aria-describedby={aria["aria-describedby"]}
          aria-invalid={aria["aria-invalid"]}
          aria-required={aria["aria-required"] ?? (required || undefined)}
          className={cn("h-9 w-full bg-transparent", className)}
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent position="popper" align="start">
          {allowClear ? (
            <>
              <SelectItem value={NONE}>{clearLabel}</SelectItem>
              <SelectSeparator />
            </>
          ) : null}
          {groupOptions(options).map(([group, items]) =>
            group ? (
              <SelectGroup key={group}>
                <SelectLabel>{group}</SelectLabel>
                {items.map((o) => (
                  <SelectItem key={o.value} value={o.value} disabled={o.disabled}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            ) : (
              items.map((o) => (
                <SelectItem key={o.value} value={o.value} disabled={o.disabled}>
                  {o.label}
                </SelectItem>
              ))
            ),
          )}
        </SelectContent>
      </Select>
      {/* Explicit hidden input keeps submission predictable (Radix only renders its own inside forms). */}
      {name ? <input type="hidden" name={name} value={current} /> : null}
    </>
  );
}

type SearchableSelectProps = BaseSelectProps & {
  searchPlaceholder?: string;
  emptyText?: string;
};

/**
 * Searchable single select for long lists (countries, currencies, languages). Matches label, value
 * and option keywords.
 */
export function SearchableSelect({
  name,
  options,
  value,
  defaultValue,
  onValueChange,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  emptyText = "No matches found.",
  allowClear = false,
  clearLabel = "None",
  disabled,
  className,
  id,
  required,
  ...aria
}: SearchableSelectProps) {
  const [current, setCurrent] = useControllableString(value, defaultValue, onValueChange);
  const [open, setOpen] = useState(false);
  const autoId = useId();
  const selected = options.find((o) => o.value === current);

  const choose = (next: string) => {
    setCurrent(next);
    setOpen(false);
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id ?? autoId}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-label={aria["aria-label"]}
            aria-describedby={aria["aria-describedby"]}
            aria-invalid={aria["aria-invalid"]}
            aria-required={aria["aria-required"] ?? (required || undefined)}
            disabled={disabled}
            className={cn(
              "h-9 w-full justify-between bg-transparent px-2.5 font-normal",
              !selected && "text-muted-foreground",
              isInvalid(aria["aria-invalid"]) && "border-destructive",
              className,
            )}
          >
            <span className="truncate">{selected?.label ?? placeholder}</span>
            <ChevronsUpDown aria-hidden="true" className="text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-(--radix-popover-trigger-width) min-w-64 p-0">
          <Command loop>
            <CommandInput placeholder={searchPlaceholder} aria-label={searchPlaceholder} />
            <CommandList>
              <CommandEmpty>{emptyText}</CommandEmpty>
              {allowClear && current ? (
                <CommandGroup>
                  <CommandItem value={NONE} onSelect={() => choose("")} className="text-muted-foreground">
                    {clearLabel}
                  </CommandItem>
                </CommandGroup>
              ) : null}
              {groupOptions(options).map(([group, items]) => (
                <CommandGroup key={group ?? "options"} heading={group ?? undefined}>
                  {items.map((o) => (
                    <CommandItem
                      key={o.value}
                      value={o.value}
                      keywords={[o.label, ...(o.keywords ?? [])]}
                      disabled={o.disabled}
                      data-checked={o.value === current}
                      aria-checked={o.value === current}
                      onSelect={() => choose(o.value)}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{o.label}</span>
                        {o.description ? <span className="block truncate text-xs text-muted-foreground">{o.description}</span> : null}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {name ? <input type="hidden" name={name} value={current} /> : null}
    </>
  );
}

type PresetSelectProps = Omit<SearchableSelectProps, "searchPlaceholder" | "emptyText"> & { searchPlaceholder?: string; emptyText?: string };

/** Country picker — options from `countryOptions()` (ISO 3166-1 alpha-2 values). */
export function CountrySelect(props: PresetSelectProps) {
  return <SearchableSelect placeholder="Select a country" searchPlaceholder="Search countries" emptyText="No country found." {...props} options={withCodeKeyword(props.options)} />;
}

/** Currency picker — options from `currencyOptions()` (ISO 4217 values). Never default to INR silently. */
export function CurrencySelect(props: PresetSelectProps) {
  return <SearchableSelect placeholder="Select a currency" searchPlaceholder="Search currencies" emptyText="No currency found." {...props} options={withCodeKeyword(props.options)} />;
}

/** Language picker — options built from `listLanguages()` (BCP-47 values). */
export function LanguageSelect(props: PresetSelectProps) {
  return <SearchableSelect placeholder="Select a language" searchPlaceholder="Search languages" emptyText="No language found." {...props} options={withCodeKeyword(props.options)} />;
}

/** Let users search by code ("AE", "AED", "te") as well as by name. */
function withCodeKeyword(options: SelectOption[]): SelectOption[] {
  return options.map((o) => ({ ...o, keywords: Array.from(new Set([...(o.keywords ?? []), o.value])) }));
}
