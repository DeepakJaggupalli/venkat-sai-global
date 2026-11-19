import { describe, expect, it } from "vitest";

import { buildShareText, posterShareDetails, whatsappShareHref } from "./share";

describe("poster share text", () => {
  it("joins title, details and the apply link", () => {
    expect(buildShareText({ title: " Welders ", details: "Saudi Arabia: Welder", url: "https://x.test/requirements/a" })).toBe(
      "Welders - Saudi Arabia: Welder\nApply: https://x.test/requirements/a",
    );
    expect(buildShareText({ title: "Welders", details: " ", url: "https://x.test/r" })).toBe("Welders\nApply: https://x.test/r");
  });

  it("summarises country and at most three trades", () => {
    expect(posterShareDetails("Qatar", ["Welder", "Fitter", " ", "Rigger", "Helper"])).toBe("Qatar: Welder, Fitter, Rigger and 1 more");
    expect(posterShareDetails(null, ["Welder"])).toBe("Welder");
    expect(posterShareDetails("Oman")).toBe("Oman");
  });

  it("encodes the text for wa.me", () => {
    expect(whatsappShareHref("A & B\nApply: https://x.test/?a=1")).toBe("https://wa.me/?text=A%20%26%20B%0AApply%3A%20https%3A%2F%2Fx.test%2F%3Fa%3D1");
  });
});
