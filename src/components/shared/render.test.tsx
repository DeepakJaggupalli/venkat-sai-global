import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";

import { OrgAvatar, UserAvatar } from "./avatars";
import { Callout } from "./callout";
import { DataTable } from "./data-table/data-table";
import type { DataTableColumn } from "./data-table/types";
import { DateText } from "./date-text";
import { EmptyState } from "./empty-state";
import { FileList } from "./file-list";
import { FormField } from "./form/form-field";
import { KeyValueList } from "./key-value-list";
import { LoadingState } from "./loading-state";
import { MoneyText } from "./money-text";
import { PageHeader } from "./page-header";
import { Pagination } from "./pagination";
import { CompletenessMeter, ProgressRing } from "./progress-ring";
import { SectionCard } from "./section-card";
import { StatCard } from "./stat-card";
import { StatusBadge } from "./status-badge";
import { Stepper } from "./stepper";
import { Timeline } from "./timeline";
import { VerificationBadge } from "./verification-badge";

const render = (ui: ReactElement) => renderToStaticMarkup(<TooltipProvider>{ui}</TooltipProvider>);

describe("server rendering smoke tests", () => {
  it("renders the page header with breadcrumbs, status and actions", () => {
    const html = render(
      <PageHeader
        title="Jobs"
        description="Sample description"
        breadcrumbs={[{ label: "Employer", href: "/employer" }, { label: "Jobs" }]}
        status={<StatusBadge status="published" domain="job" />}
        actions={[{ label: "Post a job", href: "/employer/jobs/new" }]}
      />,
    );
    expect(html).toContain("<h1");
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('href="/employer/jobs/new"');
    expect(html).toContain("Published");
  });

  it("labels section cards by their heading", () => {
    const html = render(<SectionCard id="docs" title="Documents">Body</SectionCard>);
    expect(html).toContain('aria-labelledby="docs-title"');
    expect(html).toContain('id="docs-title"');
  });

  it("renders key-value lists as description lists with honest empty values", () => {
    const html = render(<KeyValueList items={[{ label: "Code", value: "JOB-1" }, { label: "Start", value: null }]} />);
    expect(html).toMatch(/<dl[^>]*>.*<dt[^>]*>Code<\/dt>/);
    expect(html).toContain("Not provided");
  });

  it("does not make static callouts live regions, but announces dynamic ones", () => {
    expect(render(<Callout tone="warning" title="Heads up">Text</Callout>)).not.toContain('role="alert"');
    expect(render(<Callout tone="danger" live="assertive">Failed</Callout>)).toContain('role="alert"');
    expect(render(<Callout tone="danger" title="Oops" />)).toContain("Error:");
  });

  it("renders empty states and loading presets", () => {
    expect(render(<EmptyState title="No jobs yet" primaryAction={{ label: "Post", href: "/x" }} />)).toContain('href="/x"');
    for (const variant of ["page", "table", "cards", "detail"] as const) {
      const html = render(<LoadingState variant={variant} />);
      expect(html).toContain('role="status"');
      expect(html).toContain("Loading…");
    }
  });

  it("renders stat cards from props only, with a spoken delta", () => {
    const html = render(<StatCard label="Open jobs" value={12} delta={{ value: 0.2, period: "vs last month" }} href="/jobs" />);
    expect(html).toContain("Increased by 20% vs last month");
    expect(html).toContain('href="/jobs"');
    expect(render(<StatCard label="Unknown" value={null} />)).toContain("Not available");
  });

  it("distinguishes verification states in text", () => {
    const html = render(<VerificationBadge state="employer_supplied" />);
    expect(html).toContain("Employer-supplied");
    expect(html).toContain("Not independently verified");
  });

  it("renders timelines, steppers and progress", () => {
    expect(render(<Timeline items={[{ id: "1", title: "Submitted", at: "2026-11-01T09:30:00.000Z", actor: { name: "Sample" } }]} />)).toContain("<ol");
    const stepper = render(<Stepper current="b" steps={[{ id: "a", label: "A" }, { id: "b", label: "B" }]} />);
    expect(stepper).toContain('aria-current="step"');
    expect(stepper).toContain("Step 2 of 2");
    expect(render(<ProgressRing value={60} label="Profile" />)).toContain('aria-valuenow="60"');
    expect(render(<CompletenessMeter items={[{ id: "a", label: "Add photo", done: false, href: "/p" }]} />)).toContain('href="/p"');
  });

  it("builds pagination links that keep filters", () => {
    const html = render(<Pagination pathname="/jobs" searchParams={{ q: "weld", page: "2" }} page={2} pageCount={5} total={90} pageSize={20} itemLabel="jobs" />);
    expect(html).toContain('href="/jobs?q=weld"'); // page 1 drops the param
    expect(html).toContain('href="/jobs?q=weld&amp;page=3"');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain("jobs");
  });

  it("renders data tables with sorting, row links and mobile cards", () => {
    type Row = { id: string; title: string; n: number };
    const columns: DataTableColumn<Row>[] = [
      { id: "title", header: "Title", cell: (r) => r.title, sortKey: true },
      { id: "n", header: "Count", align: "right", cell: (r) => r.n },
    ];
    const html = render(
      <DataTable
        caption="Sample rows"
        rows={[{ id: "1", title: "Alpha", n: 3 }]}
        columns={columns}
        getRowId={(r) => r.id}
        rowLink={(r) => ({ href: `/rows/${r.id}`, label: `Open ${r.title}` })}
        sort={{ by: "title", dir: "asc", pathname: "/rows", searchParams: {} }}
      />,
    );
    expect(html).toContain('aria-sort="ascending"');
    expect(html).toContain('href="/rows?sort=title&amp;dir=desc"');
    expect(html).toContain('href="/rows/1"');
    expect(html).toContain("Open Alpha");
    expect(html).toContain("<caption");
    expect(html).toContain("<dt");
    expect(render(<DataTable caption="Empty" rows={[] as Row[]} columns={columns} getRowId={(r) => r.id} />)).toContain("Nothing to show");
  });

  it("formats money, dates, files and avatars", () => {
    expect(render(<MoneyText amountMinor={320_000} currency="AED" />)).toMatch(/3,200/);
    expect(render(<MoneyText amountMinor={null} currency="AED" />)).toContain("—");
    expect(render(<DateText value="2026-12-01T00:00:00.000Z" dateOnly />)).toContain('dateTime="2026-12-01"');
    expect(render(<FileList files={[{ id: "f", name: "cv.pdf", size: 2048, mimeType: "application/pdf", href: "/f" }]} />)).toContain("PDF · 2.0 KB");
    expect(render(<UserAvatar name="Sample Person" labelled />)).toContain('aria-label="Sample Person"');
    expect(render(<OrgAvatar name="Example Co." verified />)).toContain("Verified organisation");
  });

  it("wires FormField label, hint and errors for assistive technology", () => {
    const html = render(
      <FormField label="Job title" name="title" required hint="Shown to candidates" state={{ ok: false, error: "Fix it", fieldErrors: { title: ["Title is required"] } }}>
        <input />
      </FormField>,
    );
    const id = /<input id="([^"]+)"/.exec(html)?.[1];
    expect(id).toBeTruthy();
    expect(html).toContain(`for="${id}"`);
    expect(html).toContain(`aria-describedby="${id}-hint ${id}-error"`);
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('name="title"');
    expect(html).toContain("required");
    expect(html).toContain("Title is required");
  });
});
