import { describe, expect, it } from "vitest";

import { isAllowedMapEmbedUrl, isSafeLink, parseVideoEmbedUrl } from "./embeds";

describe("video embeds", () => {
  it.each([
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"],
    ["https://youtu.be/dQw4w9WgXcQ?t=10", "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"],
    ["https://www.youtube.com/shorts/dQw4w9WgXcQ", "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"],
    ["https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ", "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"],
    ["https://vimeo.com/123456789", "https://player.vimeo.com/video/123456789"],
    ["https://vimeo.com/123456789/abcdef1234", "https://player.vimeo.com/video/123456789?h=abcdef1234"],
    ["https://player.vimeo.com/video/123456789", "https://player.vimeo.com/video/123456789"],
  ])("normalises %s", (input, expected) => {
    expect(parseVideoEmbedUrl(input)?.embedUrl).toBe(expected);
  });

  it.each([
    "http://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://www.youtube.com/playlist?list=PL123",
    "https://www.youtube.com/watch?v=short",
    "https://evil.example/embed/dQw4w9WgXcQ",
    "https://vimeo.com/channels/staffpicks",
    "javascript:alert(1)",
    "",
  ])("rejects %s", (input) => {
    expect(parseVideoEmbedUrl(input)).toBeNull();
  });
});

describe("map embeds and links", () => {
  it("allows only Google Maps and OpenStreetMap embeds over https", () => {
    expect(isAllowedMapEmbedUrl("https://www.google.com/maps/embed?pb=!1m18")).toBe(true);
    expect(isAllowedMapEmbedUrl("https://www.openstreetmap.org/export/embed.html?bbox=1")).toBe(true);
    expect(isAllowedMapEmbedUrl("http://www.google.com/maps/embed?pb=1")).toBe(false);
    expect(isAllowedMapEmbedUrl("https://www.google.com/search?q=maps")).toBe(false);
  });

  it("accepts site paths only when allowed and never protocol-relative or script links", () => {
    expect(isSafeLink("/jobs", { allowRelative: true })).toBe(true);
    expect(isSafeLink("/jobs", { allowRelative: false })).toBe(false);
    expect(isSafeLink("//evil.example", { allowRelative: true })).toBe(false);
    expect(isSafeLink("/\\evil.example", { allowRelative: true })).toBe(false);
    expect(isSafeLink("https://example.com", { allowRelative: false })).toBe(true);
    expect(isSafeLink("javascript:alert(1)", { allowRelative: true })).toBe(false);
    expect(isSafeLink("data:text/html,x", { allowRelative: true })).toBe(false);
    expect(isSafeLink("/a b", { allowRelative: true })).toBe(false);
  });
});
