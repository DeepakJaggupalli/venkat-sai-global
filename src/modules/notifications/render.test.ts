import { describe, expect, it } from "vitest";

import { buildEmail } from "./email-layout";
import { extractPlaceholders, formatTemplateValue, renderPlainText, renderSubject, renderTemplate, resolveSections, safeHref } from "./render";

const ctx = { timeZone: "Asia/Kolkata", locale: "en", appUrl: "https://app.example.test" };

describe("placeholders and sections", () => {
  it("substitutes values and drops empty ones cleanly", () => {
    expect(renderPlainText("Hello {{name}}, your code is {{code}}.", { name: "Asha", code: "VSG-1" }, ctx)).toBe("Hello Asha, your code is VSG-1.");
    expect(renderPlainText("Hello {{name}}, welcome.", {}, ctx)).toBe("Hello, welcome.");
  });
  it("renders positive and inverted sections", () => {
    const t = "Hello{{#name}} {{name}}{{/name}},{{^name}} there,{{/name}} ok";
    expect(renderPlainText(t, { name: "Ravi" }, ctx)).toBe("Hello Ravi, ok");
    expect(renderPlainText(t, { name: "" }, ctx)).toBe("Hello, there, ok");
  });
  it("treats 0 as present and false / empty arrays as absent", () => {
    expect(resolveSections("{{#n}}has{{/n}}{{^n}}none{{/n}}", { n: 0 })).toBe("has");
    expect(resolveSections("{{#n}}has{{/n}}{{^n}}none{{/n}}", { n: false })).toBe("none");
    expect(resolveSections("{{#n}}has{{/n}}{{^n}}none{{/n}}", { n: [] })).toBe("none");
  });
  it("supports nested sections with different keys and drops unbalanced tags", () => {
    expect(resolveSections("{{#a}}A{{#b}}B{{/b}}{{/a}}", { a: 1, b: 1 })).toBe("AB");
    expect(resolveSections("{{#a}}A{{#b}}B{{/b}}{{/a}}", { a: 1 })).toBe("A");
    expect(resolveSections("x{{#a}}y", { a: 1 })).toBe("xy");
  });
  it("lists every key a template uses", () => {
    expect(extractPlaceholders("{{#a}}{{b}}{{/a}} {{c}} {{^d}}x{{/d}}")).toEqual(["a", "b", "c", "d"]);
  });
});

describe("value formatting", () => {
  it("formats ISO timestamps in the recipient's zone and calendar dates as dates", () => {
    expect(formatTemplateValue("2026-11-07T10:30:00.000Z", ctx)).toMatch(/7 Nov 2026/);
    expect(formatTemplateValue("2026-11-07T10:30:00.000Z", ctx)).toMatch(/4:00/);
    expect(formatTemplateValue("2026-12-31", ctx)).toMatch(/31 Dec 2026/);
  });
  it("joins arrays, prints booleans and never dumps objects", () => {
    expect(formatTemplateValue(["a", "b"], ctx)).toBe("a, b");
    expect(formatTemplateValue(true, ctx)).toBe("Yes");
    expect(formatTemplateValue({ secret: "x" }, ctx)).toBe("");
    expect(formatTemplateValue(2026, ctx)).toBe("2026");
  });
});

describe("HTML rendering and escaping", () => {
  it("escapes values so they cannot inject markup or links", () => {
    const out = renderTemplate({ subject: "Hi {{name}}", body: "Name: **{{name}}**" }, { name: '<img src=x onerror="alert(1)"> [x](javascript:alert(1)) **b**' }, ctx);
    expect(out.html).not.toContain("<img");
    expect(out.html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(out.html).not.toMatch(/href="javascript/);
    expect(out.html).toContain("**b**");
    expect(out.html).toContain("<strong>");
    expect(out.subject).toBe('Hi <img src=x onerror="alert(1)"> [x](javascript:alert(1)) **b**');
  });
  it("escapes template text too", () => {
    expect(renderTemplate({ subject: null, body: "<script>x</script>" }, {}, ctx).html).toBe('<p style="margin:0 0 16px 0;">&lt;script&gt;x&lt;/script&gt;</p>');
  });
  it("renders paragraphs, line breaks, bullet lists and safe links", () => {
    const body = "First line\nsecond line\n\n- one\n- two\n\nSee [your application](/talent/applications) or [site]({{url}}).";
    const out = renderTemplate({ subject: "S", body }, { url: "https://example.test/x?a=1&b=2" }, ctx);
    expect(out.html).toContain("First line<br>second line");
    expect(out.html).toContain("<ul");
    expect(out.html).toContain('<li style="margin:0 0 6px 0;">one</li>');
    expect(out.html).toContain('href="https://app.example.test/talent/applications"');
    expect(out.html).toContain('href="https://example.test/x?a=1&amp;b=2"');
    expect(out.text).toContain("your application (https://app.example.test/talent/applications)");
  });
  it("refuses unsafe link targets", () => {
    expect(safeHref("javascript:alert(1)", ctx.appUrl)).toBeNull();
    expect(safeHref("//evil.test", ctx.appUrl)).toBeNull();
    expect(safeHref("/\\evil.test", ctx.appUrl)).toBeNull();
    expect(safeHref("/ok", ctx.appUrl)).toBe("https://app.example.test/ok");
    const out = renderTemplate({ subject: "S", body: "[click]({{u}})" }, { u: "javascript:alert(1)" }, ctx);
    expect(out.html).not.toContain("href");
    expect(out.html).toContain("click");
  });
  it("keeps subjects on one line and short", () => {
    expect(renderSubject("A\nB  {{x}}", { x: "c" }, ctx)).toBe("A B c");
    expect(renderSubject("{{x}}", { x: "y".repeat(400) }, ctx).length).toBeLessThanOrEqual(200);
  });
});

describe("email layout", () => {
  const base = {
    locale: "en",
    subject: "Your application was updated",
    bodyHtml: "<p>Body</p>",
    bodyText: "Body",
    brand: { name: "Venkat Sai Global", legalEntity: "Venkat Sai Welding Works and Testing Center", address: "Auto Nagar, Visakhapatnam", homeUrl: "https://app.example.test/" },
  };
  it("includes the button, the plain link fallback, preferences and the unsubscribe link", () => {
    const email = buildEmail({
      ...base,
      cta: { label: "View application", url: "https://app.example.test/talent/applications/1" },
      footer: { reason: "Because.", preferencesUrl: "https://app.example.test/account/notifications/preferences", unsubscribeUrl: "https://app.example.test/notifications/unsubscribe?token=a.b", unsubscribeLabel: "Unsubscribe from application emails" },
    });
    expect(email.html).toContain('lang="en"');
    expect(email.html).toContain('role="presentation"');
    expect(email.html).toContain("View application");
    expect(email.html).toContain("If the button does not work");
    expect(email.html).toContain("/notifications/unsubscribe?token=a.b");
    expect(email.html).toContain("Manage notification preferences");
    expect(email.text).toContain("Unsubscribe from application emails: https://app.example.test/notifications/unsubscribe?token=a.b");
  });
  it("omits the unsubscribe link and explains mandatory messages", () => {
    const email = buildEmail({ ...base, footer: { reason: "Because.", mandatoryNote: "This is a required service message." } });
    expect(email.html).not.toContain("unsubscribe");
    expect(email.html).toContain("This is a required service message.");
  });
  it("escapes the subject in the document title and heading", () => {
    const email = buildEmail({ ...base, subject: "<b>x</b>", footer: { reason: "r" } });
    expect(email.html).toContain("<title>&lt;b&gt;x&lt;/b&gt;</title>");
  });
});
