/**
 * Dashboard kit (see README.md). Import from the folder or from the file:
 *   import { DashboardHeader, StatGrid, StatTile, QuickActions, HowToUse } from "@/components/dashboard";
 * Names that also exist in `@/components/shared` (SectionCard, EmptyState) are the dashboard-styled versions.
 * ChartCard is NOT re-exported (it pulls in recharts): import it from "@/components/dashboard/chart-card".
 */
export { checklistProgress, nextChecklistItem } from "./checklist";
export { CountUp, canCountUp } from "./count-up";
export { DashboardHeader, type DashboardHeaderProps } from "./dashboard-header";
export { EmptyState, type EmptyStateProps } from "./empty-state";
export { GettingStarted, type GettingStartedProps } from "./getting-started";
export { DASHBOARD_TIME_ZONE, firstNameOf, formatDashboardDate, greetingFor, timeOfDay } from "./greeting";
export { HowToUse, type HowToUseProps } from "./how-to-use";
export { PillLink } from "./pill-link";
export { QuickActions, type QuickActionsProps } from "./quick-actions";
export { RecentList, type RecentListProps } from "./recent-list";
export { SectionCard, SectionLink, type SectionCardLink, type SectionCardProps } from "./section-card";
export { StatGrid, StatTile, type StatTileProps, type StatTileTone } from "./stat-tile";
export type { ChartDatum, ChecklistItem, DashboardAction, HowToUseStep, QuickActionItem, RecentItem } from "./types";
