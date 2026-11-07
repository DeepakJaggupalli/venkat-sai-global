import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgres://unused:unused@127.0.0.1:1/unused";
});

import { newAuthFlow, sealAuthFlow, unsealAuthFlow, type AuthFlow } from "./flow";
import { sealJson } from "./seal";

describe("auth flow cookie", () => {
  const flow: AuthFlow = newAuthFlow({
    kind: "signup",
    purpose: "signup_otp",
    channel: "email",
    target: "asha@example.com",
    userId: "6f1c1f0e-7b8a-4c55-9a51-0d7c2f8b6a11",
    intent: "candidate",
    returnTo: null,
    resendAvailableAt: Date.now() + 60_000,
  });

  it("round-trips through authenticated encryption", () => {
    const sealed = sealAuthFlow(flow);
    expect(sealed).not.toContain("asha");
    expect(unsealAuthFlow(sealed)).toEqual(flow);
  });

  it("is void after it expires", () => {
    expect(unsealAuthFlow(sealAuthFlow(flow), flow.expiresAt + 1)).toBeNull();
  });

  it("rejects tampering, foreign payloads and invalid shapes", () => {
    const sealed = sealAuthFlow(flow);
    const parts = sealed.split(".");
    parts[2] = `${parts[2]!.startsWith("A") ? "B" : "A"}${parts[2]!.slice(1)}`;
    expect(unsealAuthFlow(parts.join("."))).toBeNull();
    expect(unsealAuthFlow(sealJson("oauth-google", flow))).toBeNull();
    expect(unsealAuthFlow(sealJson("auth-flow", { ...flow, purpose: "admin" }))).toBeNull();
    expect(unsealAuthFlow("garbage")).toBeNull();
    expect(unsealAuthFlow(null)).toBeNull();
  });
});
