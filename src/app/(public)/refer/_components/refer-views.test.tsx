import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { MyReferralsView, ReferrerLinkResult } from "@/modules/referrals/schemas";

import { MyReferrals } from "./my-referrals";
import { ShareLinkCard } from "./share-link-card";

const URL = "https://venkatsai.test/r/7KQ2MX";

function view(overrides: Partial<MyReferralsView> = {}): MyReferralsView {
  return {
    firstName: "Ravi",
    code: "7KQ2MX",
    url: URL,
    active: true,
    items: [
      { name: "Suresh N.", trade: "Pipe fitter", stage: "placed", reward: "due" },
      { name: "Mohan R.", trade: "Welder", stage: "in_progress", reward: "in_progress" },
      { name: "Kiran", trade: "Helper", stage: "placed", reward: "paid" },
    ],
    counts: { total: 3, placed: 2, due: 1, paid: 1 },
    ...overrides,
  };
}

describe("Check my referrals result", () => {
  it("shows each friend's short name, trade, stage and reward, the due notice and the share link", () => {
    const html = renderToStaticMarkup(<MyReferrals view={view()} />);
    expect(html).toContain("Hello Ravi. 3 people sent a CV through your link.");
    for (const text of ["Suresh N.", "Pipe fitter", "Placed abroad", "Due", "Mohan R.", "In progress", "Kiran", "Paid"]) expect(html).toContain(text);
    expect(html).toContain('data-testid="my-referrals-due"');
    expect(html).toContain('href="https://wa.me/?text=');
    expect(html).toContain(encodeURIComponent(URL));
    expect(html).not.toContain("my-referrals-paused");
  });

  it("is honest when nothing came through the link yet", () => {
    const html = renderToStaticMarkup(<MyReferrals view={view({ items: [], counts: { total: 0, placed: 0, due: 0, paid: 0 } })} />);
    expect(html).toContain("No CVs through your link yet.");
    expect(html).not.toContain("my-referrals-due");
    expect(html).not.toContain("Sent a CV");
  });

  it("says a blocked link is paused and offers no share button", () => {
    const html = renderToStaticMarkup(<MyReferrals view={view({ active: false })} />);
    expect(html).toContain('data-testid="my-referrals-paused"');
    expect(html).not.toContain("Share my link on WhatsApp");
  });
});

describe("Get my link result", () => {
  it("shows the link, the code, Share on WhatsApp (no fixed number) and Copy link", () => {
    const result: ReferrerLinkResult = { firstName: "Ravi", code: "7KQ2MX", url: URL, returning: false };
    const html = renderToStaticMarkup(<ShareLinkCard result={result} onSeeReferrals={() => undefined} onStartAgain={() => undefined} />);
    expect(html).toContain("Ravi, your link is ready.");
    expect(html).toContain(`value="${URL}"`);
    expect(html).toContain(">7KQ2MX<");
    expect(html).toContain('href="https://wa.me/?text=');
    expect(html).toContain("Copy link");
  });

  it("welcomes a returning referrer back", () => {
    const html = renderToStaticMarkup(<ShareLinkCard result={{ firstName: "", code: "7KQ2MX", url: URL, returning: true }} onSeeReferrals={() => undefined} onStartAgain={() => undefined} />);
    expect(html).toContain("Welcome back. Here is your link.");
  });
});
