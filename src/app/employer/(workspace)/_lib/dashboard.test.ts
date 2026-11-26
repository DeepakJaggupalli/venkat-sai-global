import { readdirSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { EMPLOYER_PERMISSIONS } from "@/config/permissions";

import {
  canUse,
  dashboardCopy,
  employerHeaderActions,
  employerQuickActions,
  employerSetupChecklist,
  employerStatTiles,
  employerTodos,
  hasDashboardActivity,
  joinAmounts,
  pipelineChartData,
  pipelineTotals,
  requestChartData,
  verificationPlan,
  weekRange,
  type EmployerDashboardFacts,
  type EmployerSetupFacts,
  type EmployerTodoFacts,
} from "./dashboard";

const ALL = EMPLOYER_PERMISSIONS.map((p) => p.key);
/** Seeded "Hiring Manager"-like role: no billing, team or company profile. */
const HIRING = ["employer.dashboard", "employer.jobs.view", "employer.jobs.manage", "employer.candidates.search", "employer.candidates.lists", "employer.pipeline.view", "employer.pipeline.manage", "employer.interviews.manage"];
const FINANCE = ["employer.dashboard", "employer.billing.view", "employer.billing.manage"];

const FACTS: EmployerDashboardFacts = {
  requirements: { open: 3, openPositions: 25, drafts: 1, total: 5 },
  pipeline: { active: 12, shortlisted: 4, atInterview: 2, offer: 1, joined: 3 },
  interviewsThisWeek: 2,
  offers: { awaitingReply: 1, accepted: 2, drafts: 1 },
  placements: { deployed: 3, onTheWay: 2 },
  jobs: { live: 4, drafts: 2, inReview: 1, changesRequested: 1, total: 8 },
  billing: { amountDue: "AED 1,200.00", unpaidInvoices: 2 },
  team: { members: 3, pendingInvitations: 1 },
};

const EMPTY: EmployerDashboardFacts = {
  requirements: { open: 0, openPositions: 0, drafts: 0, total: 0 },
  pipeline: { active: 0, shortlisted: 0, atInterview: 0, offer: 0, joined: 0 },
  interviewsThisWeek: 0,
  offers: { awaitingReply: 0, accepted: 0, drafts: 0 },
  placements: { deployed: 0, onTheWay: 0 },
  jobs: { live: 0, drafts: 0, inReview: 0, changesRequested: 0, total: 0 },
  billing: { amountDue: null, unpaidInvoices: 0 },
  team: { members: 1, pendingInvitations: 0 },
};

// --- Real routes of the employer workspace (/agency is served by the same pages) -------------------------------

const WORKSPACE = path.resolve(__dirname, "..");

function workspaceRoutes(): string[][] {
  const routes: string[][] = [];
  const walk = (dir: string, segments: string[]) => {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) {
        if (name.startsWith("_") || name.startsWith("[...")) continue;
        walk(full, /^\(.*\)$/.test(name) ? segments : [...segments, name]);
      } else if (name === "page.tsx") routes.push(segments);
    }
  };
  walk(WORKSPACE, []);
  return routes;
}

const ROUTES = workspaceRoutes();

function isRealRoute(href: string): boolean {
  const pathname = href.split(/[?#]/)[0]!;
  const base = pathname.startsWith("/agency") ? "/agency" : "/employer";
  if (!pathname.startsWith(base)) return false;
  const url = pathname.slice(base.length).split("/").filter(Boolean);
  return ROUTES.some((route) => route.length === url.length && route.every((seg, i) => /^\[.+\]$/.test(seg) || seg === url[i]));
}

// ---------------------------------------------------------------------------------------------------------------

describe("canUse", () => {
  it("treats no rule as everyone and a list as any one of them", () => {
    expect(canUse([], undefined)).toBe(true);
    expect(canUse(new Set(["employer.billing.view"]), "employer.billing.view")).toBe(true);
    expect(canUse(["employer.billing.view"], ["employer.team.manage", "employer.billing.view"])).toBe(true);
    expect(canUse(["employer.billing.view"], "employer.team.manage")).toBe(false);
  });
});

describe("dashboardCopy", () => {
  it("talks to a company about candidates and to a travel agency about workers for its clients", () => {
    const company = dashboardCopy("direct_company");
    const agency = dashboardCopy("travel_agency");
    expect(company).toMatchObject({ base: "/employer", portal: "employer", people: "candidates", noun: "company" });
    expect(agency).toMatchObject({ base: "/agency", portal: "agency", people: "workers", noun: "agency" });
    expect(agency.overviewDescription).toMatch(/clients/);
    expect(agency.bulkDescription).toMatch(/Prasad/);
  });
});

describe("employerQuickActions", () => {
  it("gives a company owner every main button, each linking to a real page in /employer", () => {
    const items = employerQuickActions("direct_company", ALL);
    expect(items.map((i) => i.label)).toEqual([
      "Request manpower",
      "Manpower requests",
      "Post a job",
      "Search talent",
      "Talent lists",
      "Pipeline",
      "Interviews",
      "Offers & placements",
      "Reports",
      "Invoices & billing",
      "Team",
      "Company profile",
      "Announcements",
      "Messages",
      "Support",
      "How to use",
    ]);
    for (const item of items) {
      expect(item.href.startsWith("/employer/")).toBe(true);
      expect(isRealRoute(item.href), item.href).toBe(true);
    }
  });

  it("keeps a travel agency in /agency with requirement-first buttons (no jobs, talent search or reports)", () => {
    const items = employerQuickActions("travel_agency", ALL);
    const labels = items.map((i) => i.label);
    expect(labels).toContain("Request manpower");
    expect(labels).toContain("Candidates & pipeline");
    expect(labels).toContain("Deployment & mobilisation");
    expect(labels).toContain("Agency profile");
    expect(labels).not.toContain("Post a job");
    expect(labels).not.toContain("Search talent");
    expect(labels).not.toContain("Reports");
    for (const item of items) {
      expect(item.href.startsWith("/agency/")).toBe(true);
      expect(isRealRoute(item.href), item.href).toBe(true);
    }
  });

  it("hides buttons the role cannot use", () => {
    const hiring = employerQuickActions("direct_company", HIRING).map((i) => i.label);
    expect(hiring).toEqual(expect.arrayContaining(["Post a job", "Search talent", "Pipeline", "Interviews", "Messages", "Support"]));
    expect(hiring).not.toEqual(expect.arrayContaining(["Invoices & billing"]));
    expect(hiring).not.toContain("Team");
    expect(hiring).not.toContain("Company profile");
    expect(hiring).not.toContain("Request manpower");

    const finance = employerQuickActions("direct_company", FINANCE).map((i) => i.label);
    expect(finance).toEqual(["Invoices & billing", "Messages", "Support", "How to use"]);
  });

  it("shows real counts as badges", () => {
    const items = employerQuickActions("direct_company", ALL, { unpaidInvoices: 2, unreadMessages: 0, draftRequirements: null, interviewsThisWeek: 3 });
    const byLabel = Object.fromEntries(items.map((i) => [i.label, i]));
    expect(byLabel["Invoices & billing"]).toMatchObject({ badge: 2, badgeLabel: "unpaid" });
    expect(byLabel["Interviews"]).toMatchObject({ badge: 3, badgeLabel: "this week" });
    expect(byLabel["Messages"]!.badge).toBe(0);
    expect(byLabel["Manpower requests"]!.badge).toBeNull();
    expect(byLabel["Talent lists"]!.badge).toBeNull();
  });
});

describe("employerHeaderActions", () => {
  it("shows at most three pills, the most useful first, with short labels", () => {
    expect(employerHeaderActions("direct_company", ALL).map((a) => [a.label, a.href])).toEqual([
      ["Request manpower", "/employer/requirements/new"],
      ["Post a job", "/employer/jobs/new"],
      ["Search talent", "/employer/candidates"],
    ]);
    expect(employerHeaderActions("travel_agency", ALL).map((a) => [a.label, a.href])).toEqual([
      ["Request manpower", "/agency/requirements/new"],
      ["Candidates", "/agency/pipeline"],
      ["Deployment", "/agency/offers"],
    ]);
    expect(employerHeaderActions("direct_company", FINANCE).map((a) => a.label)).toEqual(["Invoices & billing", "Messages"]);
  });
});

describe("employerStatTiles", () => {
  it("shows a company owner eight real tiles, each linking to where they act", () => {
    const tiles = employerStatTiles("direct_company", ALL, FACTS);
    expect(tiles.map((t) => t.key)).toEqual(["requests", "pipeline", "interviews", "offers", "deployed", "jobs", "billing", "team"]);
    const byKey = Object.fromEntries(tiles.map((t) => [t.key, t]));
    expect(byKey.requests).toMatchObject({ value: 3, hint: "25 positions to fill", href: "/employer/requirements" });
    expect(byKey.pipeline).toMatchObject({ value: 12, hint: "4 shortlisted" });
    expect(byKey.interviews).toMatchObject({ value: 2, href: "/employer/interviews?view=week" });
    expect(byKey.deployed).toMatchObject({ label: "Workers deployed", value: 3, hint: "2 getting ready to travel" });
    expect(byKey.jobs).toMatchObject({ value: 4, hint: "1 in review · 2 drafts" });
    expect(byKey.billing).toMatchObject({ value: "AED 1,200.00", tone: "attention", hint: "2 unpaid invoices" });
    expect(byKey.team).toMatchObject({ value: 3, hint: "1 invitation pending", href: "/employer/team" });
    for (const t of tiles) if (t.href) expect(isRealRoute(t.href), t.href).toBe(true);
  });

  it("uses agency wording and a travel tile instead of jobs", () => {
    const tiles = employerStatTiles("travel_agency", ALL, FACTS);
    const keys = tiles.map((t) => t.key);
    expect(keys).not.toContain("jobs");
    expect(keys).toContain("on-the-way");
    expect(tiles).toHaveLength(8);
    const byKey = Object.fromEntries(tiles.map((t) => [t.key, t]));
    expect(byKey.deployed!.label).toBe("Workers supplied");
    expect(byKey.pipeline!.label).toBe("Your workers in the pipeline");
    expect(byKey["on-the-way"]).toMatchObject({ value: 2, href: "/agency/offers?tab=placements" });
    for (const t of tiles) if (t.href) expect(t.href.startsWith("/agency")).toBe(true);
  });

  it("leaves out tiles the role cannot see and never links where the member cannot go", () => {
    const finance = employerStatTiles("direct_company", FINANCE, FACTS);
    expect(finance.map((t) => t.key)).toEqual(["requests", "billing", "team"]);
    expect(finance.find((t) => t.key === "requests")!.href).toBeNull();
    expect(finance.find((t) => t.key === "team")!.href).toBeNull();
  });

  it("shows an honest dash when a figure could not be loaded, and nothing alarming at zero", () => {
    const tiles = employerStatTiles("direct_company", ALL, { ...EMPTY, pipeline: null, billing: null, interviewsThisWeek: null });
    const byKey = Object.fromEntries(tiles.map((t) => [t.key, t]));
    expect(byKey.pipeline!.value).toBeNull();
    expect(byKey.interviews!.value).toBeNull();
    expect(byKey.billing!.value).toBeNull();
    const zero = Object.fromEntries(employerStatTiles("direct_company", ALL, EMPTY).map((t) => [t.key, t]));
    expect(zero.billing).toMatchObject({ value: "Nothing due", tone: "default", hint: "No unpaid invoices" });
  });
});

describe("hasDashboardActivity", () => {
  it("is false for a new workspace with only drafts and true once anything real happens", () => {
    expect(hasDashboardActivity(EMPTY)).toBe(false);
    expect(hasDashboardActivity({ ...EMPTY, requirements: { open: 0, openPositions: 0, drafts: 2, total: 2 }, jobs: { ...EMPTY.jobs!, drafts: 1, total: 1 } })).toBe(false);
    expect(hasDashboardActivity({ ...EMPTY, requirements: { open: 1, openPositions: 5, drafts: 0, total: 1 } })).toBe(true);
    expect(hasDashboardActivity({ ...EMPTY, placements: { deployed: 1, onTheWay: 0 } })).toBe(true);
    expect(hasDashboardActivity(FACTS)).toBe(true);
  });
});

const SETUP: EmployerSetupFacts = {
  orgStatus: "draft",
  hasDetails: true,
  hasBranding: false,
  documentsMet: false,
  memberCount: 1,
  pendingInvitationCount: 0,
  requirementCount: 0,
  jobCount: 0,
};

describe("employerSetupChecklist", () => {
  it("lists the owner's set-up steps with done states from real data", () => {
    const items = employerSetupChecklist("direct_company", ALL, SETUP);
    expect(items.map((i) => [i.id, i.done])).toEqual([
      ["details", true],
      ["branding", false],
      ["documents", false],
      ["verification", false],
      ["team", false],
      ["first-request", false],
    ]);
    for (const i of items) expect(isRealRoute(i.href), i.href).toBe(true);
  });

  it("counts documents as done once submitted, and a job as a company's first request", () => {
    const items = employerSetupChecklist("direct_company", ALL, { ...SETUP, orgStatus: "under_review", jobCount: 1, pendingInvitationCount: 1 });
    const done = Object.fromEntries(items.map((i) => [i.id, i.done]));
    expect(done).toMatchObject({ documents: true, verification: true, team: true, "first-request": true });
  });

  it("uses agency wording and links, and only shows steps the member can do", () => {
    const agency = employerSetupChecklist("travel_agency", ALL, SETUP);
    expect(agency.find((i) => i.id === "documents")!.label).toMatch(/licence/);
    expect(agency.find((i) => i.id === "first-request")).toMatchObject({ label: "Send your first manpower request", href: "/agency/requirements/new" });
    expect(employerSetupChecklist("direct_company", HIRING, SETUP).map((i) => i.id)).toEqual(["first-request"]);
    expect(employerSetupChecklist("direct_company", HIRING, SETUP)[0]!.href).toBe("/employer/jobs/new");
    expect(employerSetupChecklist("direct_company", FINANCE, SETUP)).toEqual([]);
  });
});

describe("verificationPlan", () => {
  it("is null once verified", () => {
    expect(verificationPlan("direct_company", ALL, { orgStatus: "verified", hasDetails: true, documentsMet: true })).toBeNull();
  });

  it("walks a draft organisation through details, documents and submit", () => {
    const first = verificationPlan("direct_company", ALL, { orgStatus: "draft", hasDetails: false, documentsMet: false })!;
    expect(first.steps.map((s) => s.state)).toEqual(["current", "todo", "todo", "todo"]);
    expect(first.action).toMatchObject({ href: "/employer/company" });
    expect(first.secondary).toMatchObject({ label: "Request manpower" });

    const docs = verificationPlan("travel_agency", ALL, { orgStatus: "draft", hasDetails: true, documentsMet: false })!;
    expect(docs.steps.map((s) => s.state)).toEqual(["done", "current", "todo", "todo"]);
    expect(docs.action).toMatchObject({ label: "Upload documents", href: "/agency/company/verification" });
    expect(docs.title).toBe("Get your agency verified");

    const submit = verificationPlan("direct_company", ALL, { orgStatus: "draft", hasDetails: true, documentsMet: true })!;
    expect(submit.action!.label).toBe("Submit for verification");
  });

  it("tells a submitted organisation nothing more is needed and what it can do meanwhile", () => {
    const plan = verificationPlan("direct_company", ALL, { orgStatus: "under_review", hasDetails: false, documentsMet: false })!;
    expect(plan.tone).toBe("info");
    expect(plan.steps.map((s) => s.state)).toEqual(["done", "done", "current", "todo"]);
    expect(plan.secondary).toMatchObject({ href: "/employer/requirements/new" });
  });

  it("gives members who cannot manage the profile no verification button", () => {
    const plan = verificationPlan("direct_company", HIRING, { orgStatus: "draft", hasDetails: false, documentsMet: false })!;
    expect(plan.action).toBeNull();
    expect(plan.description).toMatch(/workspace owner/);
    expect(plan.secondary).toMatchObject({ href: "/employer/messages" });
  });

  it("covers rejected, expired and suspended organisations", () => {
    expect(verificationPlan("direct_company", ALL, { orgStatus: "rejected", hasDetails: true, documentsMet: true })).toMatchObject({ tone: "danger", action: { label: "Review and resubmit" } });
    expect(verificationPlan("direct_company", ALL, { orgStatus: "expired", hasDetails: true, documentsMet: true })).toMatchObject({ tone: "warning", action: { label: "Renew verification" } });
    expect(verificationPlan("travel_agency", HIRING, { orgStatus: "suspended", hasDetails: true, documentsMet: true })).toMatchObject({ action: { href: "/agency/support" }, secondary: null });
  });
});

const TODO: EmployerTodoFacts = {
  orgStatus: "verified",
  verificationDaysLeft: null,
  jobs: { drafts: 2, changesRequested: 1 },
  draftRequirements: 1,
  pipeline: { atInterview: 2, offer: 1 },
  draftOffers: 1,
  unpaidInvoices: 3,
  unreadMessages: 1,
};

describe("employerTodos", () => {
  it("lists real work for the owner, each with a real link", () => {
    const todos = employerTodos("direct_company", ALL, TODO);
    expect(todos.map((t) => t.id)).toEqual(["req-draft", "jobs-changes", "jobs-draft", "interviews", "offer-drafts", "invoices", "messages"]);
    for (const t of todos) expect(isRealRoute(t.href), t.href).toBe(true);
    expect(todos.find((t) => t.id === "invoices")!.title).toBe("3 unpaid invoices");
  });

  it("asks unverified or expiring organisations to act, and only shows what the role can do", () => {
    expect(employerTodos("direct_company", ALL, { ...TODO, orgStatus: "draft" })[0]!.id).toBe("verify");
    expect(employerTodos("direct_company", ALL, { ...TODO, verificationDaysLeft: 12 })[0]).toMatchObject({ id: "renew", title: "Verification ends in 12 days" });
    expect(employerTodos("direct_company", FINANCE, TODO).map((t) => t.id)).toEqual(["invoices", "messages"]);
    const agency = employerTodos("travel_agency", ALL, TODO);
    expect(agency.map((t) => t.id)).not.toContain("jobs-draft");
    expect(agency.find((t) => t.id === "interviews")!.title).toBe("2 workers at the interview stage");
    for (const t of agency) expect(t.href.startsWith("/agency/")).toBe(true);
  });

  it("is empty when nothing waits", () => {
    expect(employerTodos("direct_company", ALL, { ...TODO, jobs: { drafts: 0, changesRequested: 0 }, draftRequirements: 0, pipeline: null, draftOffers: 0, unpaidInvoices: 0, unreadMessages: 0 })).toEqual([]);
  });
});

describe("charts", () => {
  it("adds up the pipeline across jobs and leaves closed out of the chart", () => {
    const totals = pipelineTotals([{ counts: { screening: 3, offer: 1, closed: 5 } }, { counts: { screening: 2, joined: 1 } }]);
    expect(totals).toMatchObject({ screening: 5, offer: 1, joined: 1, closed: 5 });
    const data = pipelineChartData(totals);
    expect(data.map((d) => d.label)).toEqual(["Screening", "Shortlisted", "Trade test", "Interview", "Selected", "Offer", "Documents", "Travel", "Joined"]);
    expect(data.reduce((s, d) => s + d.value, 0)).toBe(7);
  });

  it("groups manpower requests into plain stages", () => {
    const data = requestChartData({ draft: 1, submitted: 2, under_review: 1, sourcing: 1, in_progress: 2, filled: 4, cancelled: 9 });
    expect(Object.fromEntries(data.map((d) => [d.label, d.value]))).toEqual({ Draft: 1, "In review": 3, Approved: 0, Sourcing: 3, "Part filled": 0, Filled: 4, "On hold": 0 });
  });
});

describe("joinAmounts", () => {
  it("keeps currencies apart and skips zero amounts", () => {
    const fmt = (minor: number, currency: string) => `${currency} ${minor / 100}`;
    expect(joinAmounts([], fmt)).toBeNull();
    expect(joinAmounts([{ amountMinor: 0, currency: "INR" }], fmt)).toBeNull();
    expect(joinAmounts([{ amountMinor: 120000, currency: "AED" }, { amountMinor: 0, currency: "INR" }, { amountMinor: 5000, currency: "SAR" }], fmt)).toBe("AED 1200 + SAR 50");
  });
});

describe("weekRange", () => {
  it("runs Monday to Monday in the member's time zone", () => {
    // Thursday 26 November 2026, 13:00 in India.
    const { from, to } = weekRange(new Date("2026-11-26T07:30:00Z"), "Asia/Kolkata");
    expect(from.toISOString()).toBe("2026-11-22T18:30:00.000Z");
    expect(to.toISOString()).toBe("2026-11-29T18:30:00.000Z");
    const dubai = weekRange(new Date("2026-11-29T21:00:00Z"), "Asia/Dubai"); // already Monday 30 Nov 01:00 in Dubai
    expect(dubai.from.toISOString()).toBe("2026-11-29T20:00:00.000Z");
  });
});

describe("workspace routes", () => {
  it("finds the employer pages", () => {
    expect(ROUTES.length).toBeGreaterThan(20);
    expect(isRealRoute("/agency/offers?tab=placements")).toBe(true);
    expect(isRealRoute("/employer/requirements/123")).toBe(true);
    expect(isRealRoute("/employer/nope")).toBe(false);
  });
});
