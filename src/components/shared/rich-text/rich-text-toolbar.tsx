"use client";

import type { Editor } from "@tiptap/react";
import { useEditorState } from "@tiptap/react";
import { Bold, Heading2, Heading3, Italic, Link2, List, ListOrdered, Quote, Redo2, Undo2, type LucideIcon } from "lucide-react";
import { useId, useRef, useState, type KeyboardEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { normalizeLinkUrl } from "../rich-text-utils";
import { TONE_STYLES } from "../tones";

type ToolId = "bold" | "italic" | "h2" | "h3" | "bulletList" | "orderedList" | "blockquote" | "link" | "undo" | "redo";

type Tool = { id: ToolId; label: string; icon: LucideIcon; shortcut?: string; keys?: string; toggle: boolean };

const TOOLS: Tool[] = [
  { id: "bold", label: "Bold", icon: Bold, shortcut: "Ctrl+B", keys: "Control+B", toggle: true },
  { id: "italic", label: "Italic", icon: Italic, shortcut: "Ctrl+I", keys: "Control+I", toggle: true },
  { id: "h2", label: "Heading", icon: Heading2, shortcut: "Ctrl+Alt+2", keys: "Control+Alt+2", toggle: true },
  { id: "h3", label: "Subheading", icon: Heading3, shortcut: "Ctrl+Alt+3", keys: "Control+Alt+3", toggle: true },
  { id: "bulletList", label: "Bulleted list", icon: List, shortcut: "Ctrl+Shift+8", keys: "Control+Shift+8", toggle: true },
  { id: "orderedList", label: "Numbered list", icon: ListOrdered, shortcut: "Ctrl+Shift+7", keys: "Control+Shift+7", toggle: true },
  { id: "blockquote", label: "Quote", icon: Quote, shortcut: "Ctrl+Shift+B", keys: "Control+Shift+B", toggle: true },
  { id: "link", label: "Link", icon: Link2, toggle: true },
  { id: "undo", label: "Undo", icon: Undo2, shortcut: "Ctrl+Z", keys: "Control+Z", toggle: false },
  { id: "redo", label: "Redo", icon: Redo2, shortcut: "Ctrl+Shift+Z", keys: "Control+Shift+Z", toggle: false },
];

/** Groups get a divider between them. */
const GROUP_BREAKS = new Set<ToolId>(["h2", "bulletList", "link", "undo"]);

export function RichTextToolbar({ editor, disabled, label }: { editor: Editor; disabled?: boolean; label: string }) {
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      h2: e.isActive("heading", { level: 2 }),
      h3: e.isActive("heading", { level: 3 }),
      bulletList: e.isActive("bulletList"),
      orderedList: e.isActive("orderedList"),
      blockquote: e.isActive("blockquote"),
      link: e.isActive("link"),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });
  const [focusIndex, setFocusIndex] = useState(0);
  const [linkOpen, setLinkOpen] = useState(false);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  const isDisabled = (tool: Tool) => disabled || (tool.id === "undo" && !state.canUndo) || (tool.id === "redo" && !state.canRedo);

  const run = (id: ToolId) => {
    const chain = editor.chain().focus();
    switch (id) {
      case "bold":
        chain.toggleBold().run();
        break;
      case "italic":
        chain.toggleItalic().run();
        break;
      case "h2":
        chain.toggleHeading({ level: 2 }).run();
        break;
      case "h3":
        chain.toggleHeading({ level: 3 }).run();
        break;
      case "bulletList":
        chain.toggleBulletList().run();
        break;
      case "orderedList":
        chain.toggleOrderedList().run();
        break;
      case "blockquote":
        chain.toggleBlockquote().run();
        break;
      case "undo":
        chain.undo().run();
        break;
      case "redo":
        chain.redo().run();
        break;
      case "link":
        setLinkOpen(true);
        break;
    }
  };

  // WAI-ARIA toolbar pattern: one tab stop, arrow keys move between buttons.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const enabled = TOOLS.map((t, i) => (isDisabled(t) ? -1 : i)).filter((i) => i >= 0);
    if (enabled.length === 0) return;
    const pos = Math.max(0, enabled.indexOf(focusIndex));
    let next: number | undefined;
    if (event.key === "ArrowRight") next = enabled[(pos + 1) % enabled.length];
    else if (event.key === "ArrowLeft") next = enabled[(pos - 1 + enabled.length) % enabled.length];
    else if (event.key === "Home") next = enabled[0];
    else if (event.key === "End") next = enabled[enabled.length - 1];
    if (next === undefined) return;
    event.preventDefault();
    setFocusIndex(next);
    buttons.current[next]?.focus();
  };

  return (
    <div role="toolbar" aria-label={label} aria-orientation="horizontal" onKeyDown={onKeyDown} className="flex flex-wrap items-center gap-0.5 border-b border-border bg-surface-subtle px-1.5 py-1">
      {TOOLS.map((tool, index) => {
        const Icon = tool.icon;
        const pressed = tool.toggle ? Boolean(state[tool.id as keyof typeof state]) : undefined;
        const button = (
          <Button
            ref={(el) => {
              buttons.current[index] = el;
            }}
            type="button"
            variant="ghost"
            size="icon-sm"
            tabIndex={index === focusIndex ? 0 : -1}
            aria-label={tool.label}
            aria-pressed={pressed}
            aria-keyshortcuts={tool.keys}
            disabled={isDisabled(tool)}
            onFocus={() => setFocusIndex(index)}
            onMouseDown={(e) => e.preventDefault() /* keep the editor selection */}
            onClick={() => run(tool.id)}
            className={cn("text-muted-foreground", pressed && "bg-teal-soft text-teal-strong hover:bg-teal-soft hover:text-teal-strong")}
          >
            <Icon aria-hidden="true" />
          </Button>
        );
        return (
          <span key={tool.id} className="contents">
            {GROUP_BREAKS.has(tool.id) ? <span aria-hidden="true" className="mx-1 h-5 w-px bg-border" /> : null}
            {tool.id === "link" ? (
              <LinkPopover editor={editor} open={linkOpen} onOpenChange={setLinkOpen} active={state.link}>
                <TooltipButton tooltip={tool.label}>{button}</TooltipButton>
              </LinkPopover>
            ) : (
              <TooltipButton tooltip={tool.shortcut ? `${tool.label} (${tool.shortcut})` : tool.label}>{button}</TooltipButton>
            )}
          </span>
        );
      })}
    </div>
  );
}

function TooltipButton({ tooltip, children }: { tooltip: string; children: React.ReactElement }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="bottom">{tooltip}</TooltipContent>
    </Tooltip>
  );
}

function LinkPopover({
  editor,
  open,
  onOpenChange,
  active,
  children,
}: {
  editor: Editor;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  active: boolean;
  children: React.ReactNode;
}) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();
  const errorId = useId();

  const handleOpenChange = (next: boolean) => {
    if (next) {
      const href = editor.getAttributes("link").href as string | undefined;
      setUrl(href ?? "");
      setError(null);
    }
    onOpenChange(next);
  };

  const apply = () => {
    const href = normalizeLinkUrl(url);
    if (!href) {
      setError("Enter a web address (https://…), an email address or a phone link.");
      return;
    }
    const { empty } = editor.state.selection;
    if (empty && !editor.isActive("link")) {
      editor
        .chain()
        .focus()
        .insertContent({ type: "text", text: url.trim(), marks: [{ type: "link", attrs: { href } }] })
        .run();
    } else {
      editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
    }
    onOpenChange(false);
  };

  const remove = () => {
    editor.chain().focus().extendMarkRange("link").unsetLink().run();
    onOpenChange(false);
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverAnchor asChild>
        <span className="inline-flex">{children}</span>
      </PopoverAnchor>
      <PopoverContent align="start" className="w-[min(22rem,calc(100vw-2rem))]">
        <form
          noValidate
          className="grid gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation(); // never submit the surrounding form
            apply();
          }}
        >
          <Label htmlFor={inputId}>Link address</Label>
          <Input
            id={inputId}
            value={url}
            inputMode="url"
            autoComplete="url"
            placeholder="https://example.com"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            onChange={(e) => setUrl(e.target.value)}
            autoFocus
          />
          {error ? (
            <p id={errorId} role="alert" className={cn("text-xs", TONE_STYLES.danger.text)}>
              {error}
            </p>
          ) : null}
          <div className="flex items-center justify-between gap-2 pt-1">
            {active ? (
              <Button type="button" variant="ghost" size="sm" onClick={remove}>
                Remove link
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm">
                Apply
              </Button>
            </div>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}
