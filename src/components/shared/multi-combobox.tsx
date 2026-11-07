"use client";

import { ChevronsUpDown, X } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

import { TONE_STYLES } from "./tones";
import type { SelectOption } from "./types";

export type LoadOptions = (query: string, signal: AbortSignal) => Promise<SelectOption[]>;

export type MultiComboboxProps = {
  /** Submitted as repeated `name[]` hidden inputs with the option values. */
  name?: string;
  /** Static options (filtered locally by label, value and keywords). */
  options?: SelectOption[];
  /** Async search instead of static options (debounced; previous requests are aborted). */
  loadOptions?: LoadOptions;
  value?: SelectOption[];
  defaultValue?: SelectOption[];
  onChange?: (selected: SelectOption[]) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  /** Prompt shown before the user has typed enough for an async search. */
  typeToSearchText?: string;
  maxSelected?: number;
  minQueryLength?: number;
  debounceMs?: number;
  disabled?: boolean;
  /** Custom option rendering (client components only). */
  renderOption?: (option: SelectOption) => ReactNode;
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean | "true" | "false";
  "aria-required"?: boolean | "true" | "false";
  "aria-label"?: string;
  /** The trigger is a combobox, which is not named by its text: pass a label via id/htmlFor, aria-label or this. */
  "aria-labelledby"?: string;
  required?: boolean;
  className?: string;
};

/**
 * Searchable multi-select with removable chips. Works with static options (from the server) or an
 * async loader (typeahead endpoints).
 *
 *   <FormField label="Preferred countries" name="countries"><MultiCombobox options={countryOptions} maxSelected={5} /></FormField>
 */
export function MultiCombobox({
  name,
  options,
  loadOptions,
  value: valueProp,
  defaultValue = [],
  onChange,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  emptyText = "No matches found.",
  typeToSearchText = "Start typing to search.",
  maxSelected,
  minQueryLength = 1,
  debounceMs = 250,
  disabled = false,
  renderOption,
  id,
  className,
  required,
  ...aria
}: MultiComboboxProps) {
  const [internal, setInternal] = useState<SelectOption[]>(defaultValue);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SelectOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const loaderRef = useRef(loadOptions);
  const autoId = useId();
  const selected = valueProp ?? internal;
  const selectedValues = new Set(selected.map((o) => o.value));
  const isAsync = Boolean(loadOptions);
  const atLimit = maxSelected !== undefined && selected.length >= maxSelected;

  useEffect(() => {
    loaderRef.current = loadOptions;
  });

  useEffect(() => {
    const loader = loaderRef.current;
    const q = query.trim();
    if (!isAsync || !open || !loader || q.length < minQueryLength) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const found = await loader(q, controller.signal);
        if (controller.signal.aborted) return;
        setResults(found);
        setLoadError(null);
      } catch {
        if (!controller.signal.aborted) setLoadError("Suggestions could not be loaded. Try again.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, debounceMs);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query, open, isAsync, minQueryLength, debounceMs]);

  const update = (next: SelectOption[], message: string) => {
    if (valueProp === undefined) setInternal(next);
    onChange?.(next);
    setAnnouncement(message);
  };

  const toggle = (option: SelectOption) => {
    if (selectedValues.has(option.value)) {
      update(
        selected.filter((o) => o.value !== option.value),
        `${option.label} removed`,
      );
    } else if (!atLimit) {
      update([...selected, option], `${option.label} selected`);
    }
  };

  const onQueryChange = (next: string) => {
    setQuery(next);
    if (!isAsync) return;
    if (next.trim().length >= minQueryLength) {
      setLoading(true);
    } else {
      setLoading(false);
      setResults([]);
    }
  };

  const visible = isAsync ? results : (options ?? []);
  const triggerText =
    selected.length === 0 ? placeholder : selected.length === 1 ? (selected[0]?.label ?? placeholder) : `${selected.length} selected`;

  return (
    <div data-slot="multi-combobox" className={cn("grid gap-2", className)}>
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) onQueryChange("");
        }}
      >
        <PopoverTrigger asChild>
          <Button
            id={id ?? autoId}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-label={aria["aria-label"]}
            aria-labelledby={aria["aria-labelledby"]}
            aria-describedby={aria["aria-describedby"]}
            aria-invalid={aria["aria-invalid"]}
            aria-required={aria["aria-required"] ?? (required || undefined)}
            disabled={disabled}
            className={cn(
              "h-9 w-full justify-between bg-transparent px-2.5 font-normal",
              selected.length === 0 && "text-muted-foreground",
              aria["aria-invalid"] && aria["aria-invalid"] !== "false" && "border-destructive",
            )}
          >
            <span className="truncate">{triggerText}</span>
            <ChevronsUpDown aria-hidden="true" className="text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-(--radix-popover-trigger-width) min-w-64 p-0">
          <Command shouldFilter={!isAsync} loop>
            <CommandInput placeholder={searchPlaceholder} value={query} onValueChange={onQueryChange} aria-label={searchPlaceholder} />
            {/* cmdk marks the highlighted option with aria-selected, so checked state uses aria-checked
                (and the list is deliberately not aria-multiselectable). */}
            <CommandList>
              {isAsync && query.trim().length < minQueryLength ? (
                <p className="px-3 py-6 text-center text-sm text-muted-foreground">{typeToSearchText}</p>
              ) : isAsync && loading ? (
                <p className="flex items-center justify-center gap-2 px-3 py-6 text-sm text-muted-foreground" role="status">
                  <Spinner aria-hidden="true" role="presentation" /> Searching…
                </p>
              ) : loadError ? (
                <p role="alert" className={cn("px-3 py-6 text-center text-sm", TONE_STYLES.danger.text)}>
                  {loadError}
                </p>
              ) : (
                <>
                  <CommandEmpty>{emptyText}</CommandEmpty>
                  <CommandGroup>
                    {visible.map((option) => {
                      const checked = selectedValues.has(option.value);
                      return (
                        <CommandItem
                          key={option.value}
                          value={option.value}
                          keywords={[option.label, ...(option.keywords ?? [])]}
                          disabled={option.disabled || (!checked && atLimit)}
                          data-checked={checked}
                          aria-checked={checked}
                          onSelect={() => toggle(option)}
                        >
                          <span className="min-w-0 flex-1">
                            {renderOption ? (
                              renderOption(option)
                            ) : (
                              <>
                                <span className="block truncate">{option.label}</span>
                                {option.description ? <span className="block truncate text-xs text-muted-foreground">{option.description}</span> : null}
                              </>
                            )}
                          </span>
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                </>
              )}
            </CommandList>
            {maxSelected !== undefined ? (
              <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
                {selected.length} of {maxSelected} selected
              </p>
            ) : null}
          </Command>
        </PopoverContent>
      </Popover>

      {selected.length > 0 ? (
        <ul aria-label="Selected" className="flex flex-wrap gap-1.5">
          {selected.map((option) => (
            <li key={option.value} className={cn("inline-flex h-7 max-w-full items-center gap-1 rounded-full pr-1 pl-2.5 text-xs font-medium", TONE_STYLES.brand.soft)}>
              <span className="truncate">{option.label}</span>
              <button
                type="button"
                disabled={disabled}
                onClick={() => toggle(option)}
                aria-label={`Remove ${option.label}`}
                className="inline-flex size-5 items-center justify-center rounded-full hover:bg-background/70"
              >
                <X aria-hidden="true" className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <span role="status" className="sr-only">
        {announcement}
      </span>
      {name ? selected.map((o) => <input key={o.value} type="hidden" name={`${name}[]`} value={o.value} />) : null}
    </div>
  );
}
