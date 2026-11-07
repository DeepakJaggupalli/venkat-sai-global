import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { createImageVariants, readImageDimensions, sanitizeImage } from "./images";

async function photoWithMetadata(): Promise<Buffer> {
  const base = await sharp({ create: { width: 40, height: 20, channels: 3, background: "#16a6a1" } }).jpeg().toBuffer();
  return sharp(base)
    .withMetadata({ orientation: 6 })
    .withExifMerge({
      IFD0: { Copyright: "Private photographer", ImageDescription: "Home address visible", Make: "PhoneCo" },
      IFD3: { GPSLatitudeRef: "N", GPSLatitude: "17/1 41/1 2400/100", GPSLongitudeRef: "E", GPSLongitude: "83/1 13/1 4800/100" },
    })
    .jpeg()
    .toBuffer();
}

describe("sanitizeImage", () => {
  it("auto-rotates from EXIF orientation and strips all metadata (EXIF, GPS)", async () => {
    const input = await photoWithMetadata();
    const before = await sharp(input).metadata();
    expect(before.orientation).toBe(6);
    expect(before.exif).toBeDefined();

    const out = await sanitizeImage(input, "image/jpeg");
    const after = await sharp(out.data).metadata();
    expect(out.mimeType).toBe("image/jpeg");
    expect(after.format).toBe("jpeg");
    expect(after.exif).toBeUndefined();
    expect(after.xmp).toBeUndefined();
    expect(after.iptc).toBeUndefined();
    expect(after.orientation).toBeUndefined();
    // Orientation 6 = rotate 90°: the 40×20 sensor image is 20×40 upright.
    expect([out.width, out.height]).toEqual([20, 40]);
    expect([after.width, after.height]).toEqual([20, 40]);
    expect(out.data.includes(Buffer.from("Home address"))).toBe(false);
  });

  it("re-encodes PNG and WebP in their own format", async () => {
    const png = await sharp({ create: { width: 8, height: 8, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0.5 } } }).png().toBuffer();
    const webp = await sharp({ create: { width: 8, height: 8, channels: 3, background: "#ffffff" } }).webp().toBuffer();
    expect((await sharp((await sanitizeImage(png, "image/png")).data).metadata()).format).toBe("png");
    expect((await sharp((await sanitizeImage(webp, "image/webp")).data).metadata()).format).toBe("webp");
  });

  it("rejects corrupt image data", async () => {
    await expect(sanitizeImage(Buffer.from("not an image at all"), "image/jpeg")).rejects.toThrow();
  });
});

describe("createImageVariants", () => {
  it("creates WebP variants bounded by 320 / 960 / 1600 px", async () => {
    const big = await sharp({ create: { width: 2000, height: 1000, channels: 3, background: "#101c35" } }).jpeg().toBuffer();
    const variants = await createImageVariants(big, ["thumb", "md", "lg"]);
    expect(variants.map((v) => [v.name, v.width, v.height, v.mimeType])).toEqual([
      ["thumb", 320, 160, "image/webp"],
      ["md", 960, 480, "image/webp"],
      ["lg", 1600, 800, "image/webp"],
    ]);
    for (const v of variants) expect((await sharp(v.data).metadata()).format).toBe("webp");
  });

  it("never upscales and skips variants that would duplicate a smaller one", async () => {
    const small = await sharp({ create: { width: 300, height: 200, channels: 3, background: "#ffffff" } }).png().toBuffer();
    const variants = await createImageVariants(small, ["lg", "thumb", "md"]);
    expect(variants.map((v) => [v.name, v.width, v.height])).toEqual([["thumb", 300, 200]]);
  });

  it("reads dimensions (orientation-aware) and returns null for non-images", async () => {
    expect(await readImageDimensions(await photoWithMetadata())).toEqual({ width: 20, height: 40 });
    expect(await readImageDimensions(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="32"></svg>'))).toEqual({ width: 64, height: 32 });
    expect(await readImageDimensions(Buffer.from("hello"))).toBeNull();
  });
});
