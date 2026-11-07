import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Callout } from "@/components/shared/callout";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import type { SearchParams } from "@/lib/http";

import { FormDemo } from "./_components/form-demo";
import { ConfirmDialogDemo, CopyButtonDemo, MaskedValueDemo, ResponsiveDialogDemo } from "./_components/interactive-demos";
import { KanbanDemo } from "./_components/kanban-demo";
import { DemoLabel, ShowcaseSection } from "./_components/showcase-section";
import { DisplaySections } from "./_sections/display";
import { FoundationsSections } from "./_sections/foundations";
import { NavigationSections } from "./_sections/navigation";

export const metadata: Metadata = {
  title: "UI showcase",
  robots: { index: false, follow: false },
};

const INDEX = [
  ["badges", "Status badges"],
  ["verification", "Verification"],
  ["stats", "Stat cards"],
  ["key-values", "Key-value list"],
  ["callouts", "Callouts"],
  ["empty", "Empty states"],
  ["loading", "Loading"],
  ["timeline", "Timeline"],
  ["stepper", "Stepper"],
  ["tabs", "Tabs"],
  ["filters", "Filters"],
  ["data-table", "Data table"],
  ["forms", "Forms"],
  ["dialogs", "Dialogs"],
  ["sensitive", "Masked values"],
  ["kanban", "Kanban"],
  ["formatting", "Formatting"],
  ["avatars", "Avatars"],
  ["progress", "Progress"],
  ["files", "Files"],
  ["read-more", "Read more"],
  ["charts", "Charts"],
] as const;

/**
 * Development-only showcase of every shared component with obviously labelled sample data, for
 * visual QA and screenshots. Returns 404 in production.
 */
export default async function UiShowcasePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const sp = await searchParams;

  return (
    <div className="container-page py-8 sm:py-10">
      <PageHeader
        eyebrow="Design system"
        title="UI showcase"
        description="Every shared component from src/components/shared with sample data. Nothing on this page reads or writes real records."
        breadcrumbs={[{ label: "Developer tools", href: "/dev/ui" }, { label: "UI showcase" }]}
        status={<StatusBadge tone="warning">Development only</StatusBadge>}
        actions={[{ label: "Component docs", href: "#badges", variant: "outline" }]}
      />
      <Callout tone="warning" title="Sample data only" className="mb-6">
        Names such as “Sample Candidate A” and “Example Co.” are placeholders for visual checks — never copy them into product screens or seeds.
      </Callout>

      <nav aria-label="Showcase sections" className="mb-6 rounded-xl border border-border bg-card p-4">
        <DemoLabel>Jump to</DemoLabel>
        <ul className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
          {INDEX.map(([id, label]) => (
            <li key={id}>
              <a href={`#${id}`} className="font-medium text-teal-strong underline-offset-2 hover:underline">
                {label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="space-y-6">
        <FoundationsSections />
        <NavigationSections searchParams={sp} />

        <ShowcaseSection id="forms" title="Forms" description="FormField wiring, selects, tag input, comboboxes, rich text, error summary, pending submit and toast — built for the ActionResult contract.">
          <FormDemo />
        </ShowcaseSection>

        <ShowcaseSection id="dialogs" title="Dialogs">
          <div>
            <DemoLabel>Confirm dialog</DemoLabel>
            <ConfirmDialogDemo />
          </div>
          <div>
            <DemoLabel>Responsive dialog</DemoLabel>
            <ResponsiveDialogDemo />
          </div>
          <div>
            <DemoLabel>Copy button</DemoLabel>
            <CopyButtonDemo />
          </div>
        </ShowcaseSection>

        <ShowcaseSection id="sensitive" title="Masked values" description="Reveal calls a Server Action that authorises and logs the access; the demo simulates success and a refusal.">
          <MaskedValueDemo />
        </ShowcaseSection>

        <ShowcaseSection id="kanban" title="Kanban board" description="Drag with mouse, touch or keyboard (Space, arrows, Space), or use the Move to menu on each card.">
          <KanbanDemo />
        </ShowcaseSection>

        <DisplaySections />
      </div>
    </div>
  );
}
