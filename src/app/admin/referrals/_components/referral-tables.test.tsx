import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import type { ReferredCvItem, ReferrerItem } from "@/modules/referrals/queries";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/admin/referrals",
  useSearchParams: () => new URLSearchParams(),
}));
// Server Actions (database, session) are not called while rendering.
vi.mock("../actions", () => ({
  markReferralPaidAction: vi.fn(),
  undoReferralPayoutAction: vi.fn(),
  unlinkCvReferralAction: vi.fn(),
  setReferrerStatusAction: vi.fn(),
  linkCvToReferrerAction: vi.fn(),
}));

import { ReferredTable } from "./referred-table";
import { ReferrersTable } from "./referrers-table";

const render = (ui: ReactElement) => renderToStaticMarkup(<TooltipProvider>{ui}</TooltipProvider>);
const CURRENCIES = [
  { value: "INR", label: "INR — Indian rupee" },
  { value: "AED", label: "AED — UAE dirham" },
];
const URL = "https://venkatsai.test/r/7KQ2MX";

function referred(overrides: Partial<ReferredCvItem> = {}, referrer: Partial<ReferredCvItem["referrer"]> = {}): ReferredCvItem {
  return {
    id: "6f1c2d3e-4b5a-4c7d-8e9f-0a1b2c3d4e5f",
    code: "VSG-CV-000123",
    name: "Suresh Babu Naidu",
    tradeLabel: "Pipe fitter",
    status: "departed",
    createdAt: new Date("2026-10-01T05:00:00Z"),
    statusChangedAt: new Date("2026-11-01T05:00:00Z"),
    reward: "due",
    referrer: { id: "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d", name: "Ravi Kumar", code: "7KQ2MX", status: "active", phone: "+919876543210", phoneMasked: "+91 ******3210", url: URL, ...referrer },
    payout: null,
    selfReferral: false,
    ...overrides,
  };
}

const table = (items: ReferredCvItem[]) => render(<ReferredTable items={items} currencies={CURRENCIES} rewardText="" empty={<p>empty</p>} footer={null} />);

describe("Referred people table", () => {
  it("offers Mark paid and a WhatsApp message to the referrer's own number for a due reward", () => {
    const html = table([referred()]);
    expect(html).toContain('data-testid="referral-mark-paid"');
    expect(html).toContain("https://wa.me/919876543210?text=");
    expect(html).toContain(encodeURIComponent("Suresh N., who you referred"));
    expect(html).toContain("Remove referral");
    expect(html).not.toContain("Undo payment");
  });

  it("does not offer Mark paid while the referrer is blocked", () => {
    const html = table([referred({}, { status: "blocked" })]);
    expect(html).not.toContain('data-testid="referral-mark-paid"');
    expect(html).toContain("Referrer blocked: unblock to pay");
  });

  it("shows the payment with its currency and Undo payment once paid", () => {
    const html = table([referred({ reward: "paid", payout: { amountMinor: 15050, currency: "AED", paidAt: new Date("2026-11-10T06:00:00Z"), paidByName: "Office", note: "UPI 4521" } })]);
    expect(html).toMatch(/AED\s*150\.50/);
    expect(html).toContain("UPI 4521");
    expect(html).toContain("Undo payment");
    expect(html).not.toContain('data-testid="referral-mark-paid"');
  });

  it("masks the referrer's number without the contact permission and flags self-referrals", () => {
    const html = table([referred({ reward: "in_progress", status: "contacted", selfReferral: true }, { phone: null })]);
    expect(html).toContain("+91 ******3210");
    expect(html).not.toContain("9876543210?text");
    expect(html).not.toContain("WhatsApp referrer");
    expect(html).toContain("Same number as the referrer");
  });
});

function referrer(overrides: Partial<ReferrerItem> = {}): ReferrerItem {
  return {
    id: "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
    name: "Ravi Kumar",
    code: "7KQ2MX",
    url: URL,
    status: "active",
    phone: "+919876543210",
    phoneMasked: "+91 ******3210",
    createdAt: new Date("2026-09-01T05:00:00Z"),
    referredCount: 4,
    placedCount: 3,
    dueCount: 1,
    paidCount: 2,
    paidTotals: [
      { currency: "AED", amountMinor: 15050 },
      { currency: "INR", amountMinor: 200000 },
    ],
    ...overrides,
  };
}

describe("Referrers table", () => {
  it("shows counts, paid totals per currency, WhatsApp with the link, and Block", () => {
    const html = render(<ReferrersTable items={[referrer()]} empty={<p>empty</p>} footer={null} />);
    expect(html).toMatch(/AED\s*150\.50/);
    expect(html).toMatch(/2,000\.00/);
    expect(html).toContain(encodeURIComponent(URL));
    expect(html).toContain('data-testid="referrer-block"');
    expect(html).not.toContain('data-testid="referrer-unblock"');
  });

  it("shows Unblock for a blocked referrer and an honest empty paid cell", () => {
    const html = render(<ReferrersTable items={[referrer({ status: "blocked", paidTotals: [], paidCount: 0, phone: null })]} empty={<p>empty</p>} footer={null} />);
    expect(html).toContain('data-testid="referrer-unblock"');
    expect(html).toContain("Nothing yet");
    expect(html).toContain("+91 ******3210");
    expect(html).not.toContain("https://wa.me/");
  });
});
