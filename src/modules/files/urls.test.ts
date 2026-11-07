import { describe, expect, it } from "vitest";

import { toUploadedFile } from "./present";
import { fileUrl, parseVariantParam, resolveVariant, thumbnailUrl } from "./urls";

const ID = "0b6f3a9e-5c1d-4e2f-9a7b-1234567890ab";
const v = (key: string) => ({ key, width: 1, height: 1, mimeType: "image/webp" });

describe("fileUrl", () => {
  it("serves public files from /media with a safe, cosmetic name", () => {
    const file = { id: ID, visibility: "public" as const, originalName: "Company Logo (2026).PNG", mimeType: "image/png" };
    expect(fileUrl(file)).toBe(`/media/${ID}/company-logo-2026.png`);
    expect(fileUrl(file, { variant: "thumb" })).toBe(`/media/${ID}/company-logo-2026.webp?variant=thumb`);
    expect(fileUrl(file, { download: true })).toBe(`/media/${ID}/company-logo-2026.png?download=1`);
  });

  it("serves private files through the access-checked API route", () => {
    const file = { id: ID, visibility: "private" as const, originalName: "cv.pdf", mimeType: "application/pdf" };
    expect(fileUrl(file)).toBe(`/api/v1/files/${ID}`);
    expect(fileUrl(file, { download: true })).toBe(`/api/v1/files/${ID}?download=1`);
    // Variants only apply to raster images.
    expect(fileUrl(file, { variant: "md" })).toBe(`/api/v1/files/${ID}`);
    expect(thumbnailUrl(file)).toBeNull();
    expect(thumbnailUrl({ ...file, mimeType: "image/jpeg" })).toBe(`/api/v1/files/${ID}?variant=thumb`);
  });
});

describe("resolveVariant", () => {
  it("uses the requested variant when it exists", () => {
    expect(resolveVariant({ thumb: v("a"), md: v("b"), lg: v("c") }, "md")).toBe("md");
  });

  it("falls back to the largest smaller variant (small originals)", () => {
    expect(resolveVariant({ thumb: v("a"), md: v("b") }, "lg")).toBe("md");
    expect(resolveVariant({ thumb: v("a") }, "lg")).toBe("thumb");
  });

  it("serves the original when no suitable variant exists yet", () => {
    expect(resolveVariant({}, "thumb")).toBeNull();
    expect(resolveVariant({ md: v("b") }, "thumb")).toBeNull();
    expect(resolveVariant(null, "md")).toBeNull();
    expect(resolveVariant({ thumb: v("a") }, null)).toBeNull();
  });

  it("parses only known variant names", () => {
    expect(parseVariantParam("lg")).toBe("lg");
    expect(parseVariantParam("../x")).toBeNull();
    expect(parseVariantParam(null)).toBeNull();
  });
});

describe("toUploadedFile", () => {
  it("returns the upload response shape", () => {
    const dto = toUploadedFile({
      id: ID,
      visibility: "private",
      originalName: "passport.jpg",
      mimeType: "image/jpeg",
      variants: { thumb: v("k") },
      sizeBytes: 1234,
      width: 800,
      height: 600,
      scanStatus: "clean",
      purpose: "candidate_document",
    });
    expect(dto).toEqual({
      id: ID,
      url: `/api/v1/files/${ID}`,
      thumbnailUrl: `/api/v1/files/${ID}?variant=thumb`,
      name: "passport.jpg",
      size: 1234,
      mimeType: "image/jpeg",
      width: 800,
      height: 600,
      scanStatus: "clean",
      visibility: "private",
      purpose: "candidate_document",
    });
  });
});
