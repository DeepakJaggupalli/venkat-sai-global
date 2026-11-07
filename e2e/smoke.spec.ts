import { expect, test } from "@playwright/test";

/**
 * Smoke tests: the app is up, renders the homepage under the nonce-based CSP without console
 * errors, and the health endpoint reports a working database.
 */
test("homepage renders", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));

  const response = await page.goto("/");
  expect(response?.ok()).toBeTruthy();
  const csp = response?.headers()["content-security-policy"] ?? "";
  expect(csp).toContain("'strict-dynamic'");
  expect(csp).toMatch(/'nonce-[A-Za-z0-9+/=]+'/);

  await expect(page.locator("main#main-content")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
  // CSP violations and hydration failures surface as console errors.
  expect(errors.filter((e) => /Content Security Policy|Refused to|Hydration/i.test(e))).toEqual([]);
});

test("health endpoint reports ok", async ({ request }) => {
  const response = await request.get("/api/v1/health");
  expect(response.ok()).toBeTruthy();
  expect(response.headers()["cache-control"]).toContain("no-store");
  const body = await response.json();
  expect(body.status).toBe("ok");
  expect(body.checks.database.status).toBe("ok");
  expect(typeof body.version).toBe("string");
  expect(typeof body.uptimeSeconds).toBe("number");
});

test("portal pages redirect signed-out visitors to sign-in", async ({ request }) => {
  const response = await request.get("/admin", { maxRedirects: 0 });
  expect(response.status()).toBe(307);
  const location = response.headers()["location"] ?? "";
  expect(new URL(location, "http://localhost").pathname).toBe("/sign-in");
  expect(new URL(location, "http://localhost").searchParams.get("returnTo")).toBe("/admin");
});
