"use client";

import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect, useId, useRef, useState } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import { normalizeEditorHtml } from "../rich-text-utils";
import { RICH_TEXT_CLASSES } from "../safe-html";
import { TONE_STYLES } from "../tones";
import { RichTextToolbar } from "./rich-text-toolbar";

type RichTextEditorProps = {
  /** Form field name — the HTML is submitted through a hidden input. Sanitise on the server with sanitizeRichText(). */
  name: string;
  /** Initial HTML (already sanitised when it was stored). */
  defaultValue?: string | null;
  onChange?: (html: string) => void;
  placeholder?: string;
  /** Soft limit on plain-text characters; the counter turns red and the field reports invalid when exceeded. */
  maxLength?: number;
  minHeight?: "sm" | "md" | "lg";
  disabled?: boolean;
  /** Id of the editable region. Inside FormField the label is linked automatically via `${id}-label`. */
  id?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean | "true" | "false";
  "aria-required"?: boolean | "true" | "false";
  required?: boolean;
  toolbarLabel?: string;
  className?: string;
};

const MIN_HEIGHT: Record<NonNullable<RichTextEditorProps["minHeight"]>, { editor: string; placeholder: string }> = {
  sm: { editor: "[&_.tiptap]:min-h-28", placeholder: "min-h-28" },
  md: { editor: "[&_.tiptap]:min-h-44", placeholder: "min-h-44" },
  lg: { editor: "[&_.tiptap]:min-h-72", placeholder: "min-h-72" },
};

/**
 * Rich text editor (Tiptap v3: starter kit + link + placeholder) producing HTML limited to what
 * sanitizeRichText() allows (paragraphs, h2/h3, bold, italic, lists, quotes, links).
 *
 *   <FormField label="Job description" name="descriptionHtml" required>
 *     <RichTextEditor name="descriptionHtml" defaultValue={job.descriptionHtml} maxLength={8000} />
 *   </FormField>
 *   // server: const html = sanitizeRichText(input.descriptionHtml)
 */
export function RichTextEditor({
  name,
  defaultValue,
  onChange,
  placeholder = "Start writing…",
  maxLength,
  minHeight = "md",
  disabled = false,
  id,
  toolbarLabel = "Formatting",
  className,
  required,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
  "aria-required": ariaRequired,
}: RichTextEditorProps) {
  const autoId = useId();
  const editorId = id ?? `rte-${autoId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const counterId = `${editorId}-count`;
  const [html, setHtml] = useState(() => (defaultValue ?? "").trim());
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  });

  const editor = useEditor({
    immediatelyRender: false,
    editable: !disabled,
    content: defaultValue || "",
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        code: false,
        codeBlock: false,
        horizontalRule: false,
        // Link is configured explicitly below (allowed protocols, no navigation while editing).
        link: false,
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        defaultProtocol: "https",
        protocols: ["mailto", "tel"],
        isAllowedUri: (url, ctx) => /^(https?:|mailto:|tel:)/i.test(url) && ctx.defaultValidate(url),
        HTMLAttributes: { rel: "noopener noreferrer nofollow", target: "_blank" },
      }),
      Placeholder.configure({ placeholder }),
    ],
    onUpdate: ({ editor: e }) => {
      const next = normalizeEditorHtml(e.getHTML(), e.isEmpty);
      setHtml(next);
      onChangeRef.current?.(next);
    },
  });

  const characters = useEditorState({ editor, selector: ({ editor: e }) => (e ? e.getText().length : 0) }) ?? 0;
  const overLimit = maxLength !== undefined && characters > maxLength;
  const invalid = overLimit || ariaInvalid === true || ariaInvalid === "true";
  const describedBy = [ariaDescribedBy, maxLength !== undefined ? counterId : null].filter(Boolean).join(" ") || undefined;
  const labelledBy = ariaLabelledBy ?? (ariaLabel ? undefined : `${editorId}-label`);
  const isRequired = Boolean(required || ariaRequired === true || ariaRequired === "true");

  // Keep the contenteditable's ARIA wiring in sync with props (the editor instance is created once).
  useEffect(() => {
    if (!editor) return;
    if (editor.isEditable === disabled) editor.setEditable(!disabled, false); // no update event: content did not change
    editor.setOptions({
      editorProps: {
        attributes: {
          id: editorId,
          role: "textbox",
          "aria-multiline": "true",
          ...(ariaLabel ? { "aria-label": ariaLabel } : {}),
          ...(labelledBy ? { "aria-labelledby": labelledBy } : {}),
          ...(describedBy ? { "aria-describedby": describedBy } : {}),
          ...(invalid ? { "aria-invalid": "true" } : {}),
          ...(isRequired ? { "aria-required": "true" } : {}),
          ...(disabled ? { "aria-disabled": "true" } : {}),
          spellcheck: "true",
          class: "tiptap",
        },
      },
    });
  }, [editor, disabled, editorId, ariaLabel, labelledBy, describedBy, invalid, isRequired]);

  return (
    <div
      data-slot="rich-text-editor"
      className={cn(
        "overflow-hidden rounded-lg border border-input bg-card transition-colors",
        "focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50",
        invalid && "border-destructive focus-within:ring-destructive/20",
        disabled && "opacity-60",
        className,
      )}
    >
      {editor ? <RichTextToolbar editor={editor} disabled={disabled} label={toolbarLabel} /> : <Skeleton aria-hidden="true" className="h-10 rounded-none bg-surface-subtle" />}
      <EditorContent
        editor={editor}
        className={cn(
          RICH_TEXT_CLASSES,
          MIN_HEIGHT[minHeight].editor,
          "[&_.tiptap]:px-3.5 [&_.tiptap]:py-2.5 [&_.tiptap]:outline-none [&_.tiptap>*:first-child]:mt-0",
          "[&_.is-editor-empty:first-child]:before:pointer-events-none [&_.is-editor-empty:first-child]:before:float-left [&_.is-editor-empty:first-child]:before:h-0 [&_.is-editor-empty:first-child]:before:text-muted-foreground [&_.is-editor-empty:first-child]:before:content-[attr(data-placeholder)]",
        )}
      />
      {!editor ? <div aria-hidden="true" className={MIN_HEIGHT[minHeight].placeholder} /> : null}
      {maxLength !== undefined ? (
        <p id={counterId} aria-live="polite" className={cn("border-t border-border px-3 py-1.5 text-right text-xs tabular-nums", overLimit ? TONE_STYLES.danger.text : "text-muted-foreground")}>
          {characters.toLocaleString("en-IN")} / {maxLength.toLocaleString("en-IN")} characters
          {overLimit ? <span className="sr-only">. Over the limit — please shorten the text.</span> : null}
        </p>
      ) : null}
      <input type="hidden" name={name} value={html} />
    </div>
  );
}
