import { describe, expect, it } from "vitest";

import { collectFileIds } from "./payload";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";

describe("collectFileIds", () => {
  it("finds ids under *fileId keys at any depth and in *fileIds arrays", () => {
    const payload = {
      logoFileId: A,
      documents: [{ title: "Registration", fileId: B }],
      profile: { attachmentFileIds: [C, "not-a-uuid"] },
    };
    expect([...collectFileIds(payload)].sort()).toEqual([A, B, C]);
  });

  it("ignores ids under other keys and non-uuid values", () => {
    expect(collectFileIds({ id: A, organizationId: B, fileId: "abc" }).size).toBe(0);
  });

  it("handles null, scalars and deep nesting safely", () => {
    expect(collectFileIds(null).size).toBe(0);
    expect(collectFileIds("x").size).toBe(0);
    let deep: Record<string, unknown> = { fileId: A };
    for (let i = 0; i < 20; i++) deep = { nested: deep };
    expect(collectFileIds(deep).size).toBe(0);
  });
});
