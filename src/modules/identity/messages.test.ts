import { describe, expect, it } from "vitest";

import { buildOtpDelivery, buildPasswordResetEmail, escapeHtml, resolveLocale } from "./messages";

describe("one-time code messages", () => {
  it("puts the code in the SMS body and exposes template variables", () => {
    const delivery = buildOtpDelivery({ purpose: "login_otp", channel: "sms", to: "+919876543210", code: "482913", minutes: 10, locale: "en" });
    expect(delivery.channel).toBe("sms");
    if (delivery.channel !== "sms") return;
    expect(delivery.message.body).toContain("482913");
    expect(delivery.message.body).toContain("10 minutes");
    expect(delivery.message.variables).toEqual({ otp: "482913", minutes: "10", purpose: "login_otp" });
  });

  it("localises e-mails and never puts the code in the subject", () => {
    for (const locale of ["en", "hi", "te"] as const) {
      const delivery = buildOtpDelivery({ purpose: "signup_otp", channel: "email", to: "a@example.com", code: "123456", minutes: 10, locale });
      if (delivery.channel !== "email") throw new Error("expected email");
      expect(delivery.message.subject).not.toContain("123456");
      expect(delivery.message.text).toContain("123456");
      expect(delivery.message.html).toContain(`lang="${locale}"`);
      expect(delivery.message.html).toContain("123456");
    }
  });

  it("escapes names and links in the password reset e-mail", () => {
    const message = buildPasswordResetEmail({
      to: "a@example.com",
      name: '<script>alert("x")</script>',
      link: "https://example.org/reset-password?token=a.b&x=<y>",
      minutes: 30,
      locale: "en",
    });
    expect(message.html).not.toContain("<script>");
    expect(message.html).toContain("&lt;script&gt;");
    expect(message.html).toContain("token=a.b&amp;x=&lt;y&gt;");
    expect(message.text).toContain("https://example.org/reset-password?token=a.b&x=<y>");
  });

  it("falls back to English for unknown locales", () => {
    expect(resolveLocale("fr")).toBe("en");
    expect(resolveLocale("te")).toBe("te");
    expect(escapeHtml(`"'&<>`)).toBe("&quot;&#39;&amp;&lt;&gt;");
  });
});
