import { FileUser, ListChecks } from "lucide-react";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ChartCard } from "./chart-card";
import { isEmptyChart, summarizeChart } from "./chart-summary";
import { checklistProgress, nextChecklistItem } from "./checklist";
import { canCountUp } from "./count-up";
import { DashboardHeader } from "./dashboard-header";
import { EmptyState } from "./empty-state";
import { GettingStarted } from "./getting-started";
import { firstNameOf, formatDashboardDate, greetingFor, hourIn, isoDateIn, timeOfDay } from "./greeting";
import { HowToUse } from "./how-to-use";
import { howToUseStorageKey, readHowToUseState, writeHowToUseState } from "./how-to-use-storage";
import { QuickActions } from "./quick-actions";
import { RecentList } from "./recent-list";
import { isAttentionValue, StatGrid, StatTile } from "./stat-tile";

const render = (ui: ReactElement) => renderToStaticMarkup(ui);
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

// 26 Nov 2026 in UTC; India is UTC+05:30.
const at = (utcHour: number, minute = 0) => new Date(Date.UTC(2026, 10, 26, utcHour, minute));

describe("greeting", () => {
  it("greets by the time of day in India", () => {
    expect(hourIn(at(3))).toBe(8); // 08:30 IST
    expect(timeOfDay(at(0))).toBe("morning"); // 05:30
    expect(timeOfDay(at(6, 29))).toBe("morning"); // 11:59
    expect(timeOfDay(at(6, 30))).toBe("afternoon"); // 12:00
    expect(timeOfDay(at(11, 29))).toBe("afternoon"); // 16:59
    expect(timeOfDay(at(11, 30))).toBe("evening"); // 17:00
    expect(timeOfDay(at(21))).toBe("evening"); // 02:30 next day
  });

  it("uses another zone when asked, and falls back to India time for an unknown one", () => {
    expect(timeOfDay(at(3), "UTC")).toBe("evening"); // 03:00 UTC
    expect(timeOfDay(at(3), "Not/AZone")).toBe("morning");
  });

  it("uses the first name only, never an email or phone number", () => {
    expect(firstNameOf("Ravi Kumar")).toBe("Ravi");
    expect(firstNameOf("  Dr. Lakshmi  Prasad ")).toBe("Lakshmi");
    expect(firstNameOf("Mr Venkat")).toBe("Venkat");
    expect(firstNameOf("ravi@example.com")).toBeNull();
    expect(firstNameOf("+91 94942 63388")).toBeNull();
    expect(firstNameOf("")).toBeNull();
    expect(firstNameOf(null)).toBeNull();
    expect(firstNameOf("A".repeat(40))).toHaveLength(25);
  });

  it("builds the heading", () => {
    expect(greetingFor("Ravi Kumar", at(3))).toBe("Good morning, Ravi");
    expect(greetingFor(null, at(8))).toBe("Good afternoon");
    expect(greetingFor("someone@example.com", at(14))).toBe("Good evening");
  });

  it("formats today's date in India", () => {
    expect(formatDashboardDate(at(20))).toBe("Friday, 27 November 2026"); // 01:30 IST on the 27th
    expect(isoDateIn(at(20))).toBe("2026-11-27");
    expect(isoDateIn(at(3))).toBe("2026-11-26");
  });
});

describe("how-to-use visibility", () => {
  const memory = () => {
    const map = new Map<string, string>();
    return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v), map };
  };
  const broken = {
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("blocked");
    },
  };

  it("is shown the first time and remembers the choice per portal", () => {
    const storage = memory();
    expect(readHowToUseState(storage, "admin")).toBe("shown");
    expect(writeHowToUseState(storage, "admin", "hidden")).toBe(true);
    expect(storage.map.get(howToUseStorageKey("admin"))).toBe("hidden");
    expect(readHowToUseState(storage, "admin")).toBe("hidden");
    expect(readHowToUseState(storage, "employer")).toBe("shown");
    writeHowToUseState(storage, "admin", "shown");
    expect(readHowToUseState(storage, "admin")).toBe("shown");
  });

  it("works without storage (blocked, missing or garbage values)", () => {
    expect(readHowToUseState(broken, "admin")).toBe("shown");
    expect(writeHowToUseState(broken, "admin", "hidden")).toBe(false);
    expect(readHowToUseState(null, "admin")).toBe("shown");
    expect(writeHowToUseState(undefined, "admin", "hidden")).toBe(false);
    const storage = memory();
    storage.setItem(howToUseStorageKey("talent"), "maybe");
    expect(readHowToUseState(storage, "talent")).toBe("shown");
  });
});

describe("checklist progress", () => {
  it("counts done items and finds the next step", () => {
    const items = [
      { id: "a", done: true },
      { id: "b", done: false },
      { id: "c", done: false },
    ];
    expect(checklistProgress(items)).toEqual({ done: 1, total: 3, percent: 33, complete: false });
    expect(nextChecklistItem(items)?.id).toBe("b");
    expect(checklistProgress(items.map((i) => ({ ...i, done: true })))).toEqual({ done: 3, total: 3, percent: 100, complete: true });
    expect(checklistProgress([])).toEqual({ done: 0, total: 0, percent: 100, complete: true });
    expect(nextChecklistItem([{ done: true }])).toBeNull();
  });
});

describe("numbers and charts", () => {
  it("counts up only whole numbers that need no digit grouping", () => {
    expect(canCountUp(12)).toBe(true);
    expect(canCountUp(999)).toBe(true);
    expect(canCountUp(0)).toBe(false);
    expect(canCountUp(1000)).toBe(false);
    expect(canCountUp(2.5)).toBe(false);
    expect(canCountUp(-3)).toBe(false);
  });

  it("flags attention only while there is something to act on", () => {
    expect(isAttentionValue("attention", 3)).toBe(true);
    expect(isAttentionValue("attention", 0)).toBe(false);
    expect(isAttentionValue("attention", null)).toBe(false);
    expect(isAttentionValue("attention", " 0 ")).toBe(false);
    expect(isAttentionValue("default", 3)).toBe(false);
  });

  it("summarises a chart in words", () => {
    const data = [
      { label: "10 Nov", value: 4 },
      { label: "17 Nov", value: 12 },
      { label: "24 Nov", value: 9 },
    ];
    expect(summarizeChart("Applicants per week", data, { unit: "applicants" })).toBe(
      "Applicants per week. 3 points, total 25 applicants. Highest: 12 applicants in 17 Nov. Latest: 9 applicants in 24 Nov.",
    );
    expect(summarizeChart("Empty", [])).toBe("Empty. No data yet.");
    expect(isEmptyChart([{ label: "a", value: 0 }])).toBe(true);
    expect(isEmptyChart(data)).toBe(false);
  });
});

describe("dashboard kit rendering", () => {
  it("renders the header with greeting, date and at most three actions", () => {
    const html = render(
      <DashboardHeader
        name="Ravi Kumar"
        subtitle="Owner · Venkat Sai Global"
        now={at(3)}
        actions={[
          { label: "One", href: "/admin/a" },
          { label: "Two", href: "/admin/b" },
          { label: "Three", href: "/admin/c" },
          { label: "Four", href: "/admin/d" },
        ]}
      />,
    );
    expect(html).toContain("<h1");
    expect(text(html)).toContain("Good morning, Ravi");
    expect(html).toContain('dateTime="2026-11-26"');
    expect(text(html)).toContain("Thursday, 26 November 2026");
    expect(html).toContain('href="/admin/c"');
    expect(html).not.toContain('href="/admin/d"');
  });

  it("renders stat tiles as links with the real value for screen readers", () => {
    const html = render(
      <StatGrid label="Today">
        <StatTile label="CVs to call back" value={12} hint="3 new today" tone="attention" icon={FileUser} href="/admin/cv-submissions" />
        <StatTile label="Revenue" value="AED 12,400" />
        <StatTile label="Unknown" value={null} />
        <StatTile label="Approvals" value={0} tone="attention" icon={ListChecks} />
      </StatGrid>,
    );
    expect(html).toContain('href="/admin/cv-submissions"');
    expect(html).toContain("--vsg-count-to:12");
    expect(html).toMatch(/<span class="sr-only">12<\/span>/);
    expect(text(html)).toContain("Needs action");
    expect(text(html).match(/Needs action/g)).toHaveLength(1); // the zero tile stays calm
    expect(text(html)).toContain("AED 12,400");
    expect(text(html)).toContain("Not available");
  });

  it("renders quick actions with spoken badge counts and nothing when empty", () => {
    const html = render(<QuickActions title="Quick actions" items={[{ label: "Approval centre", href: "/admin/approvals", icon: ListChecks, badge: 3, badgeLabel: "waiting" }]} />);
    expect(text(html)).toContain("3 waiting");
    expect(html).toContain("<h2");
    expect(render(<QuickActions items={[]} />)).toBe("");
  });

  it("hides the getting-started checklist once everything is done", () => {
    const items = [
      { id: "a", label: "Add a logo", done: true, href: "/admin/settings" },
      { id: "b", label: "Invite staff", done: false, href: "/admin/users" },
    ];
    const html = render(<GettingStarted items={items} />);
    expect(text(html)).toContain("1 of 2 done");
    expect(html).toContain("<progress");
    expect(text(html)).toContain("Next step");
    expect(render(<GettingStarted items={items.map((i) => ({ ...i, done: true }))} />)).toBe("");
  });

  it("renders recent items with relative time, and an honest empty state", () => {
    const now = at(10);
    const html = render(
      <RecentList
        title="Latest applicants"
        now={now}
        viewAll={{ label: "View all", href: "/admin/cv-submissions" }}
        items={[{ id: "1", title: "Suresh", meta: "Welder", at: at(8), href: "/admin/cv-submissions", status: { label: "New", tone: "info" } }]}
        empty={{ title: "No applicants yet" }}
      />,
    );
    expect(text(html)).toContain("2 hours ago");
    expect(text(html)).toContain("New");
    expect(html).toContain('href="/admin/cv-submissions"');
    const empty = render(<RecentList title="Latest" items={[]} empty={{ title: "No applicants yet", action: { label: "Post requirement", href: "/admin/requirements/posters/new" } }} />);
    expect(text(empty)).toContain("No applicants yet");
    expect(empty).toContain('href="/admin/requirements/posters/new"');
    expect(empty).not.toContain("View all");
  });

  it("renders the how-to-use card from the guide registry, filtered by permission", () => {
    const html = render(<HowToUse portal="admin" permissions={["content.view", "content.edit", "media.manage"]} />);
    expect(text(html)).toContain("How to use");
    expect(html).toContain('href="/admin/requirements/posters/new"');
    // The poster page needs content.edit and media.manage: content.view alone must not offer it.
    expect(render(<HowToUse portal="admin" permissions={["content.view"]} />)).not.toContain('href="/admin/requirements/posters/new"');
    expect(html).not.toContain('href="/admin/approvals"');
    expect(html).toContain('href="/admin/help"');
    expect(html).toContain('aria-expanded="true"');
    expect(render(<HowToUse portal="agency" />)).toContain('href="/agency/help"');
  });

  it("renders empty states and the empty chart", () => {
    expect(text(render(<EmptyState title="Nothing yet" action={{ label: "Add", href: "/admin" }} />))).toContain("Nothing yet");
    expect(text(render(<ChartCard title="Placements" data={[]} />))).toContain("Nothing to show yet");
  });
});
