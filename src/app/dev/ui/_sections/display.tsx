import { OrgAvatar, UserAvatar } from "@/components/shared/avatars";
import { AreaChart } from "@/components/shared/charts/area-chart";
import { BarChart } from "@/components/shared/charts/bar-chart";
import { DonutChart } from "@/components/shared/charts/donut-chart";
import { LineChart } from "@/components/shared/charts/line-chart";
import { DateText } from "@/components/shared/date-text";
import { DescriptionWithReadMore } from "@/components/shared/description-read-more";
import { FileList } from "@/components/shared/file-list";
import { MoneyText, SalaryRangeText } from "@/components/shared/money-text";
import { CompletenessMeter, ProgressRing } from "@/components/shared/progress-ring";
import { RelativeTime } from "@/components/shared/relative-time";
import { VerificationBadge } from "@/components/shared/verification-badge";

import { DemoLabel, ShowcaseSection } from "../_components/showcase-section";

const WEEKS = ["2026-09-07", "2026-09-14", "2026-09-21", "2026-09-28", "2026-10-05", "2026-10-12", "2026-10-19", "2026-10-26"];
const SAMPLE_A = [12, 18, 15, 22, 27, 24, 31, 35];
const SAMPLE_B = [6, 9, 11, 10, 14, 17, 16, 21];
const TREND = WEEKS.map((week, i) => ({ week, sampleA: SAMPLE_A[i] ?? null, sampleB: SAMPLE_B[i] ?? null }));
const BY_TRADE = [
  { trade: "Sample trade A", positions: 24 },
  { trade: "Sample trade B", positions: 18 },
  { trade: "Sample trade C", positions: 11 },
  { trade: "Sample trade D", positions: 6 },
];
const DONUT = [
  { label: "Sample source A", value: 42 },
  { label: "Sample source B", value: 25 },
  { label: "Sample source C", value: 13 },
  { label: "Sample source D", value: 8 },
  { label: "Sample source E", value: 5 },
  { label: "Sample source F", value: 4 },
  { label: "Sample source G", value: 3 },
];

const LONG_HTML =
  "<p>This is <strong>sample</strong> rich text used to demonstrate the read-more control. It is long enough to overflow the collapsed height on most screens.</p><h3>Sample responsibilities</h3><ul><li>Sample responsibility one</li><li>Sample responsibility two</li><li>Sample responsibility three</li></ul><p>Sample closing paragraph with a <a href=\"https://example.com\">sample link</a>.</p>";

export function DisplaySections() {
  return (
    <>
      <ShowcaseSection id="formatting" title="Money, dates and relative time" description="Money is minor units with the record's own currency — never assumed.">
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <DemoLabel>Money</DemoLabel>
            <MoneyText amountMinor={1_250_050} currency="INR" /> · <MoneyText amountMinor={320_000} currency="AED" /> · <MoneyText amountMinor={12_500} currency="KWD" /> ·{" "}
            <MoneyText amountMinor={null} currency="USD" />
          </div>
          <div>
            <DemoLabel>Salary range</DemoLabel>
            <SalaryRangeText minMinor={250_000} maxMinor={320_000} currency="AED" period="month" /> · <SalaryRangeText minMinor={null} maxMinor={null} currency="AED" />
          </div>
          <div>
            <DemoLabel>Dates</DemoLabel>
            <DateText value="2026-11-01T09:30:00.000Z" mode="datetime" timeZone="Asia/Kolkata" /> · <DateText value="2026-12-01T00:00:00.000Z" dateOnly />
          </div>
          <div>
            <DemoLabel>Relative time</DemoLabel>
            <RelativeTime value="2026-11-01T09:30:00.000Z" timeZone="Asia/Kolkata" />
          </div>
        </div>
      </ShowcaseSection>

      <ShowcaseSection id="avatars" title="Avatars">
        <div className="flex flex-wrap items-end gap-4">
          {(["xs", "sm", "md", "lg", "xl"] as const).map((size) => (
            <UserAvatar key={size} name="Sample Candidate A" size={size} labelled={size === "xl"} />
          ))}
          <UserAvatar name="Sample Person B" />
          <OrgAvatar name="Example Co." size="lg" verified labelled />
          <OrgAvatar name="Sample Training Institute" size="lg" />
        </div>
      </ShowcaseSection>

      <ShowcaseSection id="progress" title="Progress ring and completeness">
        <div className="flex flex-wrap items-center gap-6">
          <ProgressRing value={25} label="Sample progress" size="sm" />
          <ProgressRing value={60} label="Sample progress" />
          <ProgressRing value={100} label="Sample progress" size="lg" tone="success" />
        </div>
        <CompletenessMeter
          title="Sample profile strength"
          items={[
            { id: "basics", label: "Add basic details", done: true },
            { id: "photo", label: "Add a profile photo", done: false, href: "/dev/ui#progress" },
            { id: "passport", label: "Add passport details", done: false, href: "/dev/ui#progress", hint: "Needed for overseas jobs" },
            { id: "skills", label: "Add three skills", done: true },
          ]}
        />
      </ShowcaseSection>

      <ShowcaseSection id="files" title="File list">
        <FileList
          label="Sample documents"
          timeZone="Asia/Kolkata"
          files={[
            { id: "f1", name: "sample-resume.pdf", size: 245_000, mimeType: "application/pdf", href: "#files", uploadedAt: "2026-10-20T10:00:00.000Z", status: <VerificationBadge state="verified" variant="inline" /> },
            { id: "f2", name: "sample-certificate.jpg", size: 1_380_000, mimeType: "image/jpeg", uploadedAt: "2026-10-22T10:00:00.000Z", status: <VerificationBadge state="pending_review" variant="inline" /> },
          ]}
        />
        <FileList files={[]} emptyTitle="No sample files" emptyDescription="Uploaded files will appear here." />
      </ShowcaseSection>

      <ShowcaseSection id="read-more" title="Description with read more">
        <DescriptionWithReadMore html={LONG_HTML} lines={4} />
      </ShowcaseSection>

      <ShowcaseSection id="charts" title="Charts" description="Sample data. Validated palette, thin marks, legend for two or more series, tooltip on hover/focus, and a data table for every chart.">
        <div className="grid gap-8 lg:grid-cols-2">
          <LineChart title="Sample weekly trend" showTitle index="week" indexLabel="Week" xFormat="date" data={TREND} series={[{ key: "sampleA", label: "Sample series A" }, { key: "sampleB", label: "Sample series B" }]} />
          <AreaChart title="Sample volume" showTitle index="week" indexLabel="Week" xFormat="date" data={TREND} series={[{ key: "sampleA", label: "Sample volume" }]} />
          <BarChart title="Sample positions by trade" showTitle index="trade" indexLabel="Trade" orientation="horizontal" data={BY_TRADE} series={[{ key: "positions", label: "Positions" }]} />
          <BarChart title="Sample stacked columns" showTitle index="week" indexLabel="Week" xFormat="date" stacked data={TREND} series={[{ key: "sampleA", label: "Sample series A" }, { key: "sampleB", label: "Sample series B" }]} />
          <DonutChart title="Sample split by source" showTitle centerLabel="Sample total" categoryLabel="Source" data={DONUT} />
          <LineChart title="Sample chart with no data" showTitle index="week" data={[]} series={[{ key: "x", label: "Sample" }]} />
        </div>
      </ShowcaseSection>
    </>
  );
}
