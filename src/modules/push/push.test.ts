import { describe, expect, it } from "vitest";

import { posterMatchesFilters, requirementAlert, type AlertPoster } from "./alerts";
import { isAllowedPushEndpoint, pushSubscribeSchema, pushUnsubscribeSchema } from "./schemas";

const keys = { p256dh: "B".repeat(87), auth: "a".repeat(22) };
const fcm = "https://fcm.googleapis.com/fcm/send/abc123:APA91bExample";

describe("push subscription schema", () => {
  it("accepts a browser subscription and normalises filters", () => {
    const parsed = pushSubscribeSchema.parse({ subscription: { endpoint: fcm, expirationTime: null, keys }, trades: ["  Welder ", "welder", "Pipe  Fitter"], countryCodes: ["sa", "SA"] });
    expect(parsed.topics).toEqual(["requirements"]);
    expect(parsed.trades).toEqual(["welder", "pipe fitter"]);
    expect(parsed.countryCodes).toEqual(["SA"]);
    expect(parsed.locale).toBe("en");
  });

  it("refuses endpoints outside the known push services (SSRF) and bad keys", () => {
    expect(isAllowedPushEndpoint("https://web.push.apple.com/QGx")).toBe(true);
    expect(isAllowedPushEndpoint("https://updates.push.services.mozilla.com/wpush/v2/x")).toBe(true);
    expect(isAllowedPushEndpoint("http://fcm.googleapis.com/fcm/send/x")).toBe(false);
    expect(isAllowedPushEndpoint("https://evil.example/fcm.googleapis.com")).toBe(false);
    expect(isAllowedPushEndpoint("https://fcm.googleapis.com.evil.example/x")).toBe(false);
    expect(isAllowedPushEndpoint("https://127.0.0.1/x")).toBe(false);
    expect(pushSubscribeSchema.safeParse({ subscription: { endpoint: "https://169.254.169.254/latest", keys } }).success).toBe(false);
    expect(pushSubscribeSchema.safeParse({ subscription: { endpoint: fcm, keys: { ...keys, auth: "<script>" } } }).success).toBe(false);
    expect(pushSubscribeSchema.safeParse({ subscription: { endpoint: fcm, keys }, topics: ["marketing"] }).success).toBe(false);
    expect(pushSubscribeSchema.safeParse({ subscription: { endpoint: fcm, keys }, countryCodes: ["SAU"] }).success).toBe(false);
    expect(pushUnsubscribeSchema.safeParse({ endpoint: fcm }).success).toBe(true);
  });
});

describe("requirement alerts", () => {
  const poster: AlertPoster = {
    slug: "riyadh-welders",
    title: "Welders for Riyadh",
    countryCode: "SA",
    countryName: "Saudi Arabia",
    trades: [
      { trade: "TIG Welder", salary: "1500", currency: "SAR" },
      { trade: "Helper", salary: "900 SAR" },
    ],
  };

  it("builds the notification text and link", () => {
    expect(requirementAlert(poster)).toEqual({
      title: "New requirement: Saudi Arabia",
      body: "TIG Welder - 1500 SAR (+1 more trade)",
      url: "/requirements/riyadh-welders",
      tag: "requirement-riyadh-welders",
    });
    expect(requirementAlert({ ...poster, countryName: null, trades: [] })).toMatchObject({ title: "New requirement", body: "Welders for Riyadh" });
  });

  it("filters by country and trade, sending when the poster cannot be ruled out", () => {
    expect(posterMatchesFilters(poster, { trades: [], countryCodes: [] })).toBe(true);
    expect(posterMatchesFilters(poster, { trades: [], countryCodes: ["AE"] })).toBe(false);
    expect(posterMatchesFilters(poster, { trades: ["welder"], countryCodes: ["SA"] })).toBe(true);
    expect(posterMatchesFilters(poster, { trades: ["electrician"], countryCodes: [] })).toBe(false);
    expect(posterMatchesFilters({ ...poster, countryCode: null, trades: [] }, { trades: ["electrician"], countryCodes: ["AE"] })).toBe(true);
  });
});
