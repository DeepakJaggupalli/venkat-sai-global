import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { PublicWorkerReview } from "@/modules/worker-reviews/queries";

const store = vi.hoisted(() => ({ reviews: [] as PublicWorkerReview[], fail: false }));

vi.mock("@/modules/worker-reviews/queries", () => ({
  listPublicWorkerReviews: async (limit: number) => {
    if (store.fail) throw new Error("relation \"worker_reviews\" does not exist");
    return store.reviews.slice(0, limit);
  },
  countPublicWorkerReviews: async () => store.reviews.length,
}));

const { ReviewStars, WorkerReviewCard, WorkerReviewsSection } = await import("./worker-reviews");

const sample: PublicWorkerReview = {
  id: "r1",
  displayName: "Ravi K.",
  trade: "TIG welder",
  countryCode: "QA",
  countryName: "Qatar",
  rating: 4,
  body: "Good team.\nThey helped me with the visa.",
  writtenAt: new Date("2026-03-15T08:00:00Z"),
};

describe("worker reviews on the website", () => {
  it("shows the rating in words for screen readers, the worker's words, name, trade, flag and month", () => {
    const html = renderToStaticMarkup(<WorkerReviewCard review={sample} />);
    expect(html).toContain('aria-label="Rated 4 out of 5 (Very good)"');
    expect(html).toContain("Good team.\nThey helped me with the visa.");
    expect(html).toContain("Ravi K.");
    expect(html).toContain("TIG welder");
    expect(html).toContain('src="/flags/qa.svg"');
    expect(html).toContain("Qatar");
    expect(html).toContain("March 2026");
    expect(html).toMatch(/datetime="2026-03-15T08:00:00.000Z"/i);
  });

  it("escapes whatever the worker typed", () => {
    const html = renderToStaticMarkup(<WorkerReviewCard review={{ ...sample, body: "<script>alert(1)</script>", displayName: "<b>Ravi</b>" }} />);
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<b>Ravi</b>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("draws five stars, filled up to the rating (kept within 1 to 5)", () => {
    const filled = (html: string) => (html.match(/fill-current/g) ?? []).length;
    expect(filled(renderToStaticMarkup(<ReviewStars rating={3} />))).toBe(3);
    expect(filled(renderToStaticMarkup(<ReviewStars rating={9} />))).toBe(5);
    expect(renderToStaticMarkup(<ReviewStars rating={0} />)).toContain("Rated 1 out of 5");
    expect((renderToStaticMarkup(<ReviewStars rating={5} />).match(/<svg/g) ?? []).length).toBe(5);
  });

  it("renders nothing without reviews (or when they cannot be loaded), and a band of cards with them", async () => {
    store.reviews = [];
    expect(await WorkerReviewsSection({ limit: 6 })).toBeNull();

    store.reviews = [sample, { ...sample, id: "r2", rating: 5, countryCode: null, countryName: null }];
    store.fail = true;
    expect(await WorkerReviewsSection({ limit: 6 })).toBeNull();
    store.fail = false;

    const html = renderToStaticMarkup((await WorkerReviewsSection({ limit: 6, tone: "subtle", showAllLink: true }))!);
    expect(html.match(/data-testid="worker-review"/g)).toHaveLength(2);
    expect(html).toContain('id="worker-reviews"');
    expect(html).toContain("What our workers say");
    expect(html).toContain('href="/success-stories#worker-reviews"');
    expect(html).toContain("bg-surface-subtle");

    const one = renderToStaticMarkup((await WorkerReviewsSection({ limit: 1, heading: "Our workers say", id: "home-reviews" }))!);
    expect(one.match(/data-testid="worker-review"/g)).toHaveLength(1);
    expect(one).toContain('id="home-reviews"');
    expect(one).toContain("Our workers say");
    expect(one).not.toContain("/success-stories#worker-reviews");
  });

  it("takes translated section text (eyebrow, heading, intro and the all-reviews link)", async () => {
    store.reviews = [sample];
    store.fail = false;
    const english = renderToStaticMarkup((await WorkerReviewsSection({ showAllLink: true }))!);
    expect(english).toContain(">Reviews<");
    expect(english).toContain("All reviews");

    const translated = renderToStaticMarkup(
      (await WorkerReviewsSection({ showAllLink: true, eyebrow: "సమీక్షలు", heading: "మా కార్మికులు చెప్పేది", intro: "వారి మాటల్లోనే.", allLabel: "అన్ని సమీక్షలు" }))!,
    );
    expect(translated).toContain("సమీక్షలు");
    expect(translated).toContain("మా కార్మికులు చెప్పేది");
    expect(translated).toContain("వారి మాటల్లోనే.");
    expect(translated).toContain("అన్ని సమీక్షలు");
    expect(translated).not.toContain("All reviews");
    expect(translated).not.toContain("What our workers say");
  });
});
