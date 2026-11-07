"use client";

import { X } from "lucide-react";
import { useId, useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react";

import { cn } from "@/lib/utils";

import { TONE_STYLES } from "./tones";
import { addTags } from "./tag-utils";

type TagInputProps = {
  /** Submitted as repeated `name[]` inputs (parsed by `f.stringArray()`). */
  name?: string;
  value?: string[];
  defaultValue?: string[];
  onChange?: (tags: string[]) => void;
  placeholder?: string;
  maxTags?: number;
  maxLength?: number;
  /** Lower-case tags (keywords, slugs). */
  lowercase?: boolean;
  disabled?: boolean;
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean | "true" | "false";
  "aria-required"?: boolean | "true" | "false";
  required?: boolean;
  /** Accessible name when not wrapped in FormField. */
  "aria-label"?: string;
  className?: string;
};

/**
 * Free-text tags: Enter or comma adds, Backspace on an empty input removes the last tag, pasting a
 * comma/newline separated list adds them all. Duplicates are ignored (case-insensitive).
 *
 *   <FormField label="Keywords" name="tags" hint="Press Enter after each keyword"><TagInput maxTags={10} /></FormField>
 */
export function TagInput({
  name,
  value: valueProp,
  defaultValue = [],
  onChange,
  placeholder = "Type and press Enter",
  maxTags = 20,
  maxLength = 40,
  lowercase = false,
  disabled = false,
  id,
  className,
  required,
  ...aria
}: TagInputProps) {
  const [internal, setInternal] = useState<string[]>(defaultValue);
  const [draft, setDraft] = useState("");
  const [message, setMessage] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const autoId = useId();
  const inputId = id ?? autoId;
  const statusId = `${inputId}-status`;
  const tags = valueProp ?? internal;
  const full = tags.length >= maxTags;

  const commit = (next: string[], announcement: string) => {
    if (valueProp === undefined) setInternal(next);
    onChange?.(next);
    setMessage(announcement);
  };

  const add = (raw: string) => {
    const result = addTags(tags, raw, { maxTags, maxLength, lowercase });
    if (result.added.length > 0) commit(result.tags, `Added ${result.added.join(", ")}`);
    else if (result.rejected === "limit") setMessage(`You can add up to ${maxTags}.`);
    else if (result.rejected === "duplicate") setMessage("Already added.");
    setDraft("");
  };

  const remove = (tag: string) => {
    commit(
      tags.filter((t) => t !== tag),
      `Removed ${tag}`,
    );
    inputRef.current?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if ((event.key === "Enter" || event.key === ",") && draft.trim()) {
      event.preventDefault();
      add(draft);
    } else if (event.key === "Enter") {
      event.preventDefault(); // never submit the surrounding form from an empty tag input
    } else if (event.key === "Backspace" && !draft && tags.length > 0) {
      const last = tags[tags.length - 1];
      if (last) remove(last);
    }
  };

  const onPaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const text = event.clipboardData.getData("text");
    if (/[,\n]/.test(text)) {
      event.preventDefault();
      add(text);
    }
  };

  const describedBy = [aria["aria-describedby"], statusId].filter(Boolean).join(" ");

  return (
    <div
      data-slot="tag-input"
      data-disabled={disabled || undefined}
      onClick={() => inputRef.current?.focus()}
      className={cn(
        "flex min-h-9 w-full flex-wrap items-center gap-1.5 rounded-lg border border-input bg-transparent px-2 py-1.5 text-sm transition-colors",
        "focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50",
        aria["aria-invalid"] && aria["aria-invalid"] !== "false" && "border-destructive ring-destructive/20",
        disabled && "pointer-events-none opacity-50",
        className,
      )}
    >
      {tags.length > 0 ? (
        <ul className="flex max-w-full flex-wrap items-center gap-1.5" aria-label="Added items">
          {tags.map((tag) => (
            <li key={tag} className={cn("inline-flex h-6 max-w-full items-center gap-1 rounded-md pr-0.5 pl-2 text-xs font-medium", TONE_STYLES.neutral.soft)}>
              <span className="truncate">{tag}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  remove(tag);
                }}
                disabled={disabled}
                aria-label={`Remove ${tag}`}
                className="inline-flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-background hover:text-foreground"
              >
                <X aria-hidden="true" className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <input
        ref={inputRef}
        id={inputId}
        value={draft}
        disabled={disabled || full}
        onChange={(e) => setDraft(e.target.value.slice(0, maxLength))}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        onBlur={() => {
          if (draft.trim()) add(draft);
        }}
        placeholder={full ? `Limit of ${maxTags} reached` : placeholder}
        aria-label={aria["aria-label"]}
        aria-invalid={aria["aria-invalid"]}
        aria-required={aria["aria-required"] ?? (required || undefined)}
        aria-describedby={describedBy}
        className="h-6 min-w-24 flex-1 bg-transparent outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
      />
      <span id={statusId} role="status" className="sr-only">
        {message || `${tags.length} of ${maxTags} added`}
      </span>
      {name ? tags.map((tag) => <input key={tag} type="hidden" name={`${name}[]`} value={tag} />) : null}
    </div>
  );
}
