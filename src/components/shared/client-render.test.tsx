import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";

import { BarChart } from "./charts/bar-chart";
import { DonutChart } from "./charts/donut-chart";
import { LineChart } from "./charts/line-chart";
import { ConfirmDialog } from "./confirm-dialog";
import { CopyButton } from "./copy-button";
import { SelectableDataTable } from "./data-table/selectable-data-table";
import { DescriptionWithReadMore } from "./description-read-more";
import { DateRangeFilter } from "./filters/date-range-filter";
import { FilterBar } from "./filters/filter-bar";
import { FilterChips } from "./filters/filter-chips";
import { FilterSelect } from "./filters/filter-select";
import { SearchInput } from "./filters/search-input";
import { SubmitButton } from "./form/submit-button";
import { KanbanBoard } from "./kanban/kanban-board";
import { LinkTabs } from "./link-tabs";
import { MaskedValue } from "./masked-value";
import { MultiCombobox } from "./multi-combobox";
import { ResponsiveDialog } from "./responsive-dialog";
import { RichTextEditor } from "./rich-text/rich-text-editor";
import { CountrySelect, SimpleSelect } from "./selects";
import { TagInput } from "./tag-input";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/employer/jobs",
  useSearchParams: () => new URLSearchParams("status=draft&q=weld"),
}));

const render = (ui: ReactElement) => renderToStaticMarkup(<TooltipProvider>{ui}</TooltipProvider>);

describe("client components render on the server", () => {
  it("marks the URL-matched tab as current", () => {
    const html = render(
      <LinkTabs
        label="Views"
        items={[
          { href: "/employer/jobs", label: "All" },
          { href: "/employer/jobs?status=draft", label: "Drafts", count: 2 },
        ]}
      />,
    );
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    const current = /<a [^>]*aria-current="page"[^>]*>/.exec(html)?.[0] ?? "";
    expect(current).toContain('href="/employer/jobs?status=draft"');
  });

  it("renders the filter bar, search value, select and chips from the URL", () => {
    const html = render(
      <>
        <FilterBar paramKeys={["q", "status"]} search={<SearchInput label="Search jobs" />}>
          <FilterSelect param="status" label="Status" options={[{ value: "draft", label: "Draft" }]} allLabel="All statuses" />
          <DateRangeFilter />
        </FilterBar>
        <FilterChips filters={[{ param: "status", label: "Status", options: [{ value: "draft", label: "Draft" }] }, { param: "q", label: "Search" }]} />
      </>,
    );
    expect(html).toContain('role="search"');
    expect(html).toContain('value="weld"');
    expect(html).toContain("Reset filters");
    expect(html).toContain("Remove filter Status: Draft");
    expect(html).toContain("Remove filter Search: weld");
    expect(html).toContain("Any time");
  });

  it("submits form values through hidden inputs", () => {
    const html = render(
      <form>
        <TagInput name="tags" defaultValue={["tig", "mig"]} aria-label="Tags" />
        <MultiCombobox name="countries" options={[{ value: "AE", label: "UAE" }]} defaultValue={[{ value: "AE", label: "UAE" }]} aria-label="Countries" />
        <SimpleSelect name="type" options={[{ value: "full_time", label: "Full time" }]} defaultValue="full_time" aria-label="Type" />
        <CountrySelect name="country" options={[{ value: "IN", label: "India" }]} defaultValue="IN" aria-label="Country" />
        <RichTextEditor name="descriptionHtml" defaultValue="<p>Sample</p>" aria-label="Description" />
        <SubmitButton>Save</SubmitButton>
      </form>,
    );
    expect(html).toContain('name="tags[]" value="tig"');
    expect(html).toContain('name="tags[]" value="mig"');
    expect(html).toContain('name="countries[]" value="AE"');
    expect(html).toContain('name="type" value="full_time"');
    expect(html).toContain('name="country" value="IN"');
    expect(html).toContain('name="descriptionHtml" value="&lt;p&gt;Sample&lt;/p&gt;"');
    expect(html).toContain('type="submit"');
  });

  it("renders charts with their data-table twins", () => {
    const data = [
      { week: "2026-10-05", a: 1200 },
      { week: "2026-10-12", a: 1500 },
    ];
    const line = render(<LineChart title="Sample trend" index="week" xFormat="date" data={data} series={[{ key: "a", label: "Sample A" }]} />);
    expect(line).toContain("<figure");
    expect(line).toContain("Sample trend");
    expect(line).toContain("1,500");
    expect(line).toContain("View data table");
    const bar = render(<BarChart title="Sample bars" index="week" data={data} series={[{ key: "a", label: "Sample A" }, { key: "b", label: "Sample B" }]} />);
    expect(bar).toContain('aria-label="Legend"');
    const donut = render(<DonutChart title="Sample split" data={[{ label: "Sample X", value: 3 }, { label: "Sample Y", value: 1 }]} />);
    expect(donut).toContain("75%");
    expect(render(<LineChart title="Empty" index="week" data={[]} series={[{ key: "a", label: "A" }]} />)).toContain("No data for this period yet.");
  });

  it("renders selection tables and the kanban board", () => {
    type Row = { id: string; name: string };
    const table = render(
      <SelectableDataTable<Row>
        caption="Sample"
        rows={[{ id: "1", name: "Sample A" }]}
        columns={[{ id: "name", header: "Name", cell: (r) => r.name }]}
        getRowId={(r) => r.id}
        selectLabel={(r) => `Select ${r.name}`}
        bulkActions={[{ id: "x", label: "Do", onAction: () => undefined }]}
      />,
    );
    expect(table).toContain("Select all rows on this page");
    expect(table).toContain("Select Sample A");

    const board = render(
      <KanbanBoard
        label="Sample board"
        columns={[{ id: "a", title: "Applied" }, { id: "b", title: "Interview" }]}
        items={[{ id: "1", columnId: "a" }]}
        getItemLabel={() => "Sample card"}
        renderCard={() => <span>Sample card</span>}
        onMove={() => undefined}
      />,
    );
    expect(board).toContain('aria-label="Sample board"');
    expect(board).toContain("Move Sample card to another column");
    expect(board).toContain("Nothing here yet");
  });

  it("renders dialogs, masked values, copy and read-more controls", () => {
    expect(render(<ConfirmDialog trigger={<button type="button">Delete</button>} title="Delete?" onConfirm={() => undefined} />)).toContain("Delete");
    const masked = render(<MaskedValue masked="s***@example.com" label="email address" onReveal={async () => "x"} />);
    expect(masked).toContain("s***@example.com");
    expect(masked).toContain("Reveal");
    expect(masked).toContain("access log");
    expect(render(<CopyButton value="ABC" label="code" />)).toContain('aria-label="Copy code"');
    expect(render(<DescriptionWithReadMore html="<p>Sample</p>" />)).toContain("Sample");
    expect(render(<ResponsiveDialog trigger={<button type="button">Open</button>} title="T">Body</ResponsiveDialog>)).toContain("Open");
  });
});
