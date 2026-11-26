import type { LucideIcon } from "lucide-react";

import type { StatusDomain } from "@/components/shared/status-presets";
import type { Tone } from "@/components/shared/tones";

/**
 * Prop types of the dashboard kit (client-safe). Icons are lucide components (`icon: Briefcase`): every
 * component that takes one is a server component, so pass them straight from a server page.
 */

/** A pill button in the dashboard header or an empty state. */
export type DashboardAction = {
  label: string;
  href: string;
  icon?: LucideIcon;
  /** First action defaults to "primary" (black pill), the rest to "secondary" (white pill). */
  variant?: "primary" | "secondary";
  /** Opens in a new tab (WhatsApp, external sites) with rel="noopener noreferrer". */
  external?: boolean;
};

/** One card in <QuickActions>. Filter by permission before passing (the kit shows what it is given). */
export type QuickActionItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  /** One short line under the label ("Add a CV from a phone call"). */
  hint?: string;
  /** Real count of items waiting (0/null hides the badge). */
  badge?: number | null;
  /** Spoken with the badge, e.g. "waiting" → "3 waiting". Default "new". */
  badgeLabel?: string;
  external?: boolean;
};

/** One row in <RecentList>. */
export type RecentItem = {
  id: string;
  title: string;
  /** Second line: "Welder · Dubai", "From ABC Travels". */
  meta?: string | null;
  href?: string | null;
  /** When it happened (shown as relative time: "2 hours ago"). */
  at?: Date | string | null;
  status?: {
    /** Raw status value, resolved through the shared status presets. */
    value?: string | null;
    domain?: StatusDomain;
    /** Custom label (wins over the preset label). */
    label?: string;
    tone?: Tone;
  } | null;
};

/** One item in <GettingStarted>. `done` is computed by the caller from real data. */
export type ChecklistItem = {
  id: string;
  label: string;
  description?: string;
  done: boolean;
  href: string;
};

/** One point in <ChartCard>. */
export type ChartDatum = { label: string; value: number };

/** One step of the "How to use" card (the guide registry's quick steps). */
export type HowToUseStep = {
  title: string;
  description: string;
  href: string;
  icon?: LucideIcon;
};
