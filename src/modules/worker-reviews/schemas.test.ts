import { describe, expect, it } from "vitest";

import {
  decisionPublishes,
  defaultDisplayName,
  firstNameOf,
  isWorkerReviewTab,
  mentionsContactDetails,
  nextWorkerReviewStatus,
  ratingText,
  reviewRequestMessage,
  tidyReviewText,
  workerReviewModerateSchema,
  workerReviewSubmitSchema,
} from "./schemas";

const TOKEN = "eyJzIjoiNmYxYzJiOWUtMWQxZS00YzFhIn0.c2lnbmF0dXJlLXNpZ25hdHVyZS1zaWduYXR1cmU";

describe("names", () => {
  it("defaults the name to show to first name + last initial", () => {
    expect(defaultDisplayName("Ravi Kumar Reddy")).toBe("Ravi R.");
    expect(defaultDisplayName("  ravi   kumar ")).toBe("Ravi K.");
    expect(defaultDisplayName("MOHAMMED ABDUL RAHMAN")).toBe("Mohammed R.");
    expect(defaultDisplayName("Venkatesh")).toBe("Venkatesh");
    // Initials first (common in Andhra Pradesh): the first name is the first real word.
    expect(defaultDisplayName("K. Ravi Kumar")).toBe("Ravi K.");
    expect(defaultDisplayName("R Venkatesh")).toBe("Venkatesh R.");
    expect(defaultDisplayName("Ravi Kumar K.")).toBe("Ravi K.");
    expect(defaultDisplayName("")).toBe("");
    expect(defaultDisplayName("   ")).toBe("");
  });

  it("greets by first name", () => {
    expect(firstNameOf("K. Ravi Kumar")).toBe("Ravi");
    expect(firstNameOf("suresh")).toBe("Suresh");
    expect(firstNameOf("McDonald Smith")).toBe("McDonald");
    expect(firstNameOf("")).toBe("");
  });

  it("puts the link at the end of the WhatsApp message", () => {
    const url = "https://example.test/review/abc.def";
    expect(reviewRequestMessage("Ravi", url)).toMatch(/^Hello Ravi, this is Venkat Sai Global\..*https:\/\/example\.test\/review\/abc\.def$/);
    expect(reviewRequestMessage("", url).startsWith("Hello, this is Venkat Sai Global.")).toBe(true);
  });
});

describe("review text", () => {
  it("tidies line breaks and spaces without changing the words", () => {
    expect(tidyReviewText("  Good team.\r\n\r\n\r\n\r\nThey helped me   \r\n with the visa.  ")).toBe("Good team.\n\nThey helped me\n with the visa.");
  });

  it("flags phone numbers, emails and links for staff", () => {
    expect(mentionsContactDetails("Call me on 98765 43210")).toBe(true);
    expect(mentionsContactDetails("+971 50 123 4567 is my number")).toBe(true);
    expect(mentionsContactDetails("mail ravi@example.com")).toBe(true);
    expect(mentionsContactDetails("see www.example.org")).toBe(true);
    expect(mentionsContactDetails("visit cheapvisas.in today")).toBe(true);
    expect(mentionsContactDetails("I worked 10 years, salary 1500 QAR, joined 2025 2026.")).toBe(false);
    expect(mentionsContactDetails("Very good support. Thank you Venkat Sai!")).toBe(false);
  });

  it("describes ratings in words", () => {
    expect(ratingText(5)).toBe("5 out of 5 (Excellent)");
    expect(ratingText(1)).toBe("1 out of 5 (Poor)");
  });
});

describe("decisions", () => {
  it("allows approve, reject, hide and show again only from the right states", () => {
    expect(nextWorkerReviewStatus("pending", "approve", true)).toBe("approved");
    expect(nextWorkerReviewStatus("rejected", "approve", true)).toBe("approved");
    expect(nextWorkerReviewStatus("pending", "reject", true)).toBe("rejected");
    expect(nextWorkerReviewStatus("pending", "reject", false)).toBe("rejected");
    expect(nextWorkerReviewStatus("approved", "hide", true)).toBe("hidden");
    expect(nextWorkerReviewStatus("hidden", "unhide", true)).toBe("approved");
    // Already handled by someone else.
    expect(nextWorkerReviewStatus("approved", "approve", true)).toBeNull();
    expect(nextWorkerReviewStatus("rejected", "reject", true)).toBeNull();
    expect(nextWorkerReviewStatus("pending", "hide", true)).toBeNull();
    expect(nextWorkerReviewStatus("approved", "unhide", true)).toBeNull();
    expect(nextWorkerReviewStatus("approved", "reject", true)).toBeNull();
  });

  it("never publishes without the worker's consent", () => {
    expect(nextWorkerReviewStatus("pending", "approve", false)).toBeNull();
    expect(nextWorkerReviewStatus("rejected", "approve", false)).toBeNull();
    expect(nextWorkerReviewStatus("hidden", "unhide", false)).toBeNull();
    expect(decisionPublishes("approve")).toBe(true);
    expect(decisionPublishes("unhide")).toBe(true);
    expect(decisionPublishes("reject")).toBe(false);
    expect(decisionPublishes("hide")).toBe(false);
  });

  it("validates decisions and tabs", () => {
    expect(workerReviewModerateSchema.safeParse({ id: "6f1c2b9e-1d1e-4c1a-9a55-2a8a0b2b7c11", decision: "approve" }).success).toBe(true);
    expect(workerReviewModerateSchema.safeParse({ id: "6f1c2b9e-1d1e-4c1a-9a55-2a8a0b2b7c11", decision: "delete" }).success).toBe(false);
    expect(workerReviewModerateSchema.safeParse({ id: "1", decision: "approve" }).success).toBe(false);
    expect(isWorkerReviewTab("pending")).toBe(true);
    expect(isWorkerReviewTab("drafts")).toBe(false);
  });
});

describe("public review form", () => {
  const base = { token: TOKEN, rating: "4", body: "Good team", displayName: "Ravi K.", trade: "TIG welder" };

  it("accepts the form as posted, with consent off unless ticked", () => {
    const parsed = workerReviewSubmitSchema.parse({ ...base, countryCode: "qa", displayName: "  Ravi   K. ", body: "Good team\r\n\r\n\r\nThank you  " });
    expect(parsed).toMatchObject({ rating: 4, countryCode: "QA", displayName: "Ravi K.", body: "Good team\n\nThank you", consentToPublish: false });
    expect(workerReviewSubmitSchema.parse({ ...base, consentToPublish: "true" }).consentToPublish).toBe(true);
    expect(workerReviewSubmitSchema.parse({ ...base, countryCode: "" }).countryCode).toBeUndefined();
  });

  it("asks for a star rating and a few words", () => {
    const noStars = workerReviewSubmitSchema.safeParse({ ...base, rating: undefined });
    expect(noStars.success).toBe(false);
    expect(noStars.error?.issues[0]?.path).toEqual(["rating"]);
    for (const rating of ["0", "6", "4.5", "five"]) expect(workerReviewSubmitSchema.safeParse({ ...base, rating }).success).toBe(false);
    expect(workerReviewSubmitSchema.safeParse({ ...base, body: " a " }).success).toBe(false);
    expect(workerReviewSubmitSchema.safeParse({ ...base, body: "x".repeat(801) }).success).toBe(false);
    expect(workerReviewSubmitSchema.safeParse({ ...base, body: "x".repeat(800) }).success).toBe(true);
    expect(workerReviewSubmitSchema.safeParse({ ...base, displayName: "x".repeat(61) }).success).toBe(false);
    // Line breaks arrive as CRLF but count once, as in the textarea: 10 lines of 79 + 9 breaks = 799 characters.
    const multiLine = Array.from({ length: 10 }, () => "x".repeat(79)).join("\r\n");
    expect(multiLine.length).toBeGreaterThan(800);
    const parsedMultiLine = workerReviewSubmitSchema.safeParse({ ...base, body: multiLine });
    expect(parsedMultiLine.success).toBe(true);
    expect(parsedMultiLine.data?.body).toHaveLength(799);
    const tooLong = workerReviewSubmitSchema.safeParse({ ...base, body: `${"x".repeat(790)}\r\n${"x".repeat(10)}` });
    expect(tooLong.success).toBe(false);
    expect(tooLong.error?.issues[0]).toMatchObject({ path: ["body"], message: "Please keep your review under 800 characters" });
    const blank = workerReviewSubmitSchema.safeParse({ ...base, body: " \r\n \r\n " });
    expect(blank.error?.issues[0]).toMatchObject({ path: ["body"], message: "Write a few words about your experience" });
    expect(workerReviewSubmitSchema.safeParse({ ...base, countryCode: "Qatar" }).success).toBe(false);
    expect(workerReviewSubmitSchema.safeParse({ ...base, token: "short" }).success).toBe(false);
  });
});
