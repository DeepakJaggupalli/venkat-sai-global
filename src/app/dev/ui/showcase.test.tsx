import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";

import { FormDemo } from "./_components/form-demo";
import { ConfirmDialogDemo, CopyButtonDemo, MaskedValueDemo, ResponsiveDialogDemo } from "./_components/interactive-demos";
import { KanbanDemo } from "./_components/kanban-demo";
import { DisplaySections } from "./_sections/display";
import { FoundationsSections } from "./_sections/foundations";
import { NavigationSections } from "./_sections/navigation";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/dev/ui",
  useSearchParams: () => new URLSearchParams("sort=applications&dir=desc"),
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

describe("/dev/ui showcase", () => {
  it("renders every section with sample data", () => {
    const html = renderToStaticMarkup(
      <TooltipProvider>
        <FoundationsSections />
        <NavigationSections searchParams={{ sort: "applications", dir: "desc" }} />
        <FormDemo />
        <ConfirmDialogDemo />
        <ResponsiveDialogDemo />
        <CopyButtonDemo />
        <MaskedValueDemo />
        <KanbanDemo />
        <DisplaySections />
      </TooltipProvider>,
    );
    for (const id of ["badges", "verification", "stats", "key-values", "callouts", "empty", "loading", "timeline", "stepper", "tabs", "filters", "data-table", "formatting", "avatars", "progress", "files", "read-more", "charts"]) {
      expect(html).toContain(`id="${id}"`);
    }
    expect(html).toContain("Sample Candidate A");
    expect(html).toContain("Example Co.");
    // Sorted by applications, descending: the sample job with 14 applications comes first.
    expect(html.indexOf("Sample Welder (GTAW)")).toBeLessThan(html.indexOf("Sample Fabrication Trainee"));
  });
});
