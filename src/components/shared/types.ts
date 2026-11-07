import type { ReactNode } from "react";

/**
 * Types shared across the component library (client-safe).
 */

/** Option for selects, comboboxes and filter controls. Options are always passed in from the server. */
export type SelectOption = {
  value: string;
  label: string;
  /** Secondary line shown under the label (e.g. skill category, currency name). */
  description?: string;
  /** Extra search terms (synonyms, ISO codes) matched by searchable selects. */
  keywords?: string[];
  /** Optional group heading. */
  group?: string;
  disabled?: boolean;
};

/**
 * A navigational action rendered as a button-styled link (server-component friendly: no callbacks).
 * Use the dedicated client components (ConfirmDialog, SubmitButton) for mutations.
 */
export type LinkAction = {
  label: string;
  href: string;
  icon?: ReactNode;
  variant?: "default" | "outline" | "secondary" | "ghost";
  /** Opens in a new tab with rel="noopener noreferrer". */
  external?: boolean;
};

/** Either a declarative link action or any custom element (e.g. a client button). */
export type ActionSlot = LinkAction | ReactNode;

export function isLinkAction(value: unknown): value is LinkAction {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    "href" in value &&
    "label" in value &&
    typeof (value as LinkAction).href === "string"
  );
}
