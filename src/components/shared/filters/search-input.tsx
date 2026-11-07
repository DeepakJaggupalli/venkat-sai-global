"use client";

import { Search, X } from "lucide-react";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";

import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { cn } from "@/lib/utils";

import { useUrlFilters } from "./use-url-filters";

type SearchInputProps = {
  /** Search param to sync (default "q"). */
  param?: string;
  /** Accessible label (visually hidden unless `showLabel`). */
  label: string;
  showLabel?: boolean;
  placeholder?: string;
  debounceMs?: number;
  /** Ignore input shorter than this (except clearing). */
  minLength?: number;
  maxLength?: number;
  className?: string;
};

/**
 * Debounced search box synced to a URL param. Enter searches immediately; Escape or the clear button
 * removes the query. Wrapped in a search landmark.
 *
 *   <SearchInput label="Search jobs" placeholder="Title, code or city" />
 */
export function SearchInput({
  param = "q",
  label,
  showLabel = false,
  placeholder,
  debounceMs = 350,
  minLength = 0,
  maxLength = 120,
  className,
}: SearchInputProps) {
  const filters = useUrlFilters();
  const urlValue = filters.get(param) ?? "";
  const [value, setValue] = useState(urlValue);
  const [syncedUrlValue, setSyncedUrlValue] = useState(urlValue);
  // The last value this input wrote to the URL: its echo must not overwrite what the user is typing.
  const [lastCommitted, setLastCommitted] = useState(urlValue);
  const timer = useRef<number | null>(null);
  const id = useId();

  // Follow external URL changes (reset, chips, back/forward) without fighting the user's typing.
  if (urlValue !== syncedUrlValue) {
    setSyncedUrlValue(urlValue);
    if (urlValue !== lastCommitted) {
      setValue(urlValue);
      setLastCommitted(urlValue);
    }
  }

  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );

  const commit = (next: string) => {
    if (timer.current) window.clearTimeout(timer.current);
    const trimmed = next.trim();
    if (trimmed === urlValue) return;
    if (trimmed && trimmed.length < minLength) return;
    setLastCommitted(trimmed);
    filters.setParam(param, trimmed || null);
  };

  const onChange = (next: string) => {
    setValue(next);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => commit(next), debounceMs);
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    commit(value);
  };

  return (
    <form role="search" onSubmit={onSubmit} className={cn("min-w-0", className)}>
      <label htmlFor={id} className={cn(showLabel ? "mb-1.5 block text-sm font-medium" : "sr-only")}>
        {label}
      </label>
      <InputGroup className="h-9 bg-card">
        <InputGroupAddon>
          <Search aria-hidden="true" />
        </InputGroupAddon>
        <InputGroupInput
          id={id}
          type="search"
          inputMode="search"
          autoComplete="off"
          enterKeyHint="search"
          value={value}
          maxLength={maxLength}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape" && value) {
              e.preventDefault();
              setValue("");
              commit("");
            }
          }}
          className="[&::-webkit-search-cancel-button]:appearance-none"
        />
        {value ? (
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              size="icon-xs"
              aria-label="Clear search"
              onClick={() => {
                setValue("");
                commit("");
              }}
            >
              <X aria-hidden="true" />
            </InputGroupButton>
          </InputGroupAddon>
        ) : null}
      </InputGroup>
    </form>
  );
}
