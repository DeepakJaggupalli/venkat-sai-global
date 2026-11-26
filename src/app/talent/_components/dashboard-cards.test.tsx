import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { DocumentReminder, LinkedCvSubmission } from "../_lib/dashboard-queries";
import { DocumentsCard, type DocumentsCardLabels } from "./documents-card";
import { JourneyCard, type JourneyCardLabels } from "./journey-card";

const journeyLabels: JourneyCardLabels = {
  title: "My CV and job journey",
  description: "From CV received to departure.",
  stage: (s) => `stage:${s}`,
  reference: (code) => `Reference ${code}`,
  forTitle: (title) => `For: ${title}`,
  updated: (date) => `Updated ${date}`,
  step: (current, total) => `Step ${current} of ${total}`,
  note: "Message from our team",
  onHold: "Your CV is on hold.",
  notSuitable: "Not a match this time.",
  others: (count) => `You sent ${count} more CV`,
  check: "Check CV status",
  update: "Send / update my CV",
  emptyTitle: "No CV with us yet",
  emptyDescription: "Send your CV.",
  verifyHint: "Verify your phone number to see it here.",
  verify: "Verify phone number",
};

function submission(values: Partial<LinkedCvSubmission> = {}): LinkedCvSubmission {
  const at = new Date("2026-11-24T10:00:00Z");
  return { id: "cv1", code: "VSG-CV-000123", tradeLabel: "Pipe welder", requirementTitle: null, status: "received", candidateNote: null, createdAt: at, updatedAt: at, ...values };
}

const renderJourney = (submissions: LinkedCvSubmission[], phoneVerified = true) =>
  renderToStaticMarkup(<JourneyCard submissions={submissions} phoneVerified={phoneVerified} labels={journeyLabels} formatDate={() => "24 Nov 2026"} />);

describe("JourneyCard", () => {
  it("offers to send a CV, and asks to verify the phone only when it is not verified", () => {
    const verified = renderJourney([], true);
    expect(verified).toContain("No CV with us yet");
    expect(verified).toContain('href="/send-cv"');
    expect(verified).toContain('href="/status"');
    expect(verified).not.toContain("Verify phone number");
    const unverified = renderJourney([], false);
    expect(unverified).toContain('href="/account#contact"');
  });

  it("shows the latest CV on the journey with the team's note", () => {
    const html = renderJourney([submission({ status: "trade_test", candidateNote: "Bring <safety> shoes", requirementTitle: "Saudi pipe welders" }), submission({ id: "cv2" })]);
    expect(html).toContain("Step 3 of 8");
    expect(html.match(/aria-current="step"/g)).toHaveLength(1);
    expect(html).toContain("stage:trade_test<span class=\"sr-only\"> (now)</span>");
    expect(html.match(/ \(done\)/g)).toHaveLength(2);
    expect(html).toContain("Bring &lt;safety&gt; shoes");
    expect(html).toContain("For: Saudi pipe welders");
    expect(html).toContain('href="/status?ref=VSG-CV-000123"');
    expect(html).toContain("You sent 1 more CV");
  });

  it("keeps on hold outside the journey steps", () => {
    const html = renderJourney([submission({ status: "on_hold" })]);
    expect(html).toContain("Your CV is on hold.");
    expect(html).not.toContain("aria-current");
    expect(html).not.toContain("Step ");
  });
});

const documentLabels: DocumentsCardLabels = {
  title: "My documents",
  manage: "View all",
  allGood: "No documents expiring soon",
  allGoodDescription: "We remind you here.",
  noPassport: "Add your passport expiry date.",
  expired: (date) => `Expired on ${date}`,
  soon: (date) => `Expires on ${date}`,
  daysLeft: (count) => `${count} days left`,
  update: "Update",
  rejected: (count) => `${count} need attention`,
  pending: (count) => `${count} being checked`,
  verified: (count) => `${count} verified`,
  name: (r) => (r.kind === "passport" ? "Passport" : (r.title ?? r.type ?? "Document")),
};

describe("DocumentsCard", () => {
  const reminders: DocumentReminder[] = [
    { id: "d1", kind: "document", title: "Old visa", type: "visa", expiresOn: "2026-11-20", state: "expired" },
    { id: "p1", kind: "passport", title: null, type: null, expiresOn: "2027-02-08", state: "soon" },
  ];
  const render = (props: Partial<Parameters<typeof DocumentsCard>[0]> = {}) =>
    renderToStaticMarkup(
      <DocumentsCard reminders={reminders} counts={{ verified: 2, pending: 0, rejected: 1 }} askPassportExpiry={false} today="2026-11-26" labels={documentLabels} formatIsoDate={(iso) => iso} {...props} />,
    );

  it("lists expired and soon-expiring items with days left, linking passport to personal details", () => {
    const html = render();
    expect(html).toContain("Expired on 2026-11-20");
    expect(html).toContain("Expires on 2027-02-08");
    expect(html).toContain("74 days left");
    expect(html).toContain('href="/talent/profile#personal"');
    expect(html).toContain('href="/talent/profile#documents"');
  });

  it("shows only the non-zero document counts", () => {
    const html = render();
    expect(html).toContain("1 need attention");
    expect(html).toContain("2 verified");
    expect(html).not.toContain("being checked");
  });

  it("has an honest empty state and the passport expiry hint", () => {
    const html = render({ reminders: [], counts: null, askPassportExpiry: true });
    expect(html).toContain("No documents expiring soon");
    expect(html).toContain("Add your passport expiry date.");
    expect(html).not.toMatch(/\d+ (verified|need attention|being checked)/);
  });
});
