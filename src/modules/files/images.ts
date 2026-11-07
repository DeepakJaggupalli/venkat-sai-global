import "server-only";

import sharp from "sharp";

import { IMAGE_VARIANT_SIZES, MIME, type ImageVariantName } from "./policies";

/**
 * Image processing with sharp.
 *
 * Privacy: every raster image is decoded and re-encoded, which auto-rotates it from the EXIF
 * orientation and drops ALL metadata (EXIF incl. GPS location, XMP, IPTC, comments, embedded
 * thumbnails). Only pixels survive. Variants are WebP, bounded by IMAGE_VARIANT_SIZES (longest side),
 * never upscaled.
 */

/** Decompression-bomb guard (≈ 100 megapixels, enough for any phone or DSLR photo). */
const MAX_INPUT_PIXELS = 100_000_000;

type RasterMime = typeof MIME.jpeg | typeof MIME.png | typeof MIME.webp;

export type ProcessedImage = { data: Buffer; mimeType: RasterMime; width: number; height: number };
export type ImageVariantOutput = { name: ImageVariantName; data: Buffer; width: number; height: number; mimeType: typeof MIME.webp };

function open(data: Uint8Array) {
  // `autoOrient` applies (and removes) the EXIF orientation before any other operation.
  return sharp(data, { limitInputPixels: MAX_INPUT_PIXELS, failOn: "error", autoOrient: true, pages: 1 });
}

/** Re-encode an uploaded image in its own format with all metadata removed. */
export async function sanitizeImage(data: Uint8Array, mimeType: RasterMime): Promise<ProcessedImage> {
  const meta = await sharp(data, { limitInputPixels: MAX_INPUT_PIXELS, failOn: "error" }).metadata();
  const pipeline = open(data);
  let encoded: ReturnType<typeof sharp>;
  if (mimeType === MIME.jpeg) encoded = pipeline.jpeg({ quality: 88, mozjpeg: true });
  else if (mimeType === MIME.png) encoded = pipeline.png({ compressionLevel: 9, adaptiveFiltering: true, palette: meta.isPalette });
  else encoded = pipeline.webp({ quality: 88, effort: 4 });
  // No withMetadata()/keepMetadata(): sharp strips every metadata block by default.
  const { data: out, info } = await encoded.toBuffer({ resolveWithObject: true });
  return { data: out, mimeType, width: info.width, height: info.height };
}

/**
 * WebP variants of an (already sanitised) image. A larger variant is skipped when it would not be
 * bigger than the previous one (small originals do not get duplicate copies).
 */
export async function createImageVariants(data: Uint8Array, variants: readonly ImageVariantName[]): Promise<ImageVariantOutput[]> {
  if (!variants.length) return [];
  const ordered = [...variants].sort((a, b) => IMAGE_VARIANT_SIZES[a] - IMAGE_VARIANT_SIZES[b]);
  const outputs: ImageVariantOutput[] = [];
  let previousLongest = 0;
  for (const name of ordered) {
    const size = IMAGE_VARIANT_SIZES[name];
    const { data: out, info } = await open(data)
      .resize({ width: size, height: size, fit: "inside", withoutEnlargement: true })
      .webp({ quality: name === "thumb" ? 75 : 80, effort: 4 })
      .toBuffer({ resolveWithObject: true });
    const longest = Math.max(info.width, info.height);
    if (outputs.length && longest <= previousLongest) break;
    outputs.push({ name, data: out, width: info.width, height: info.height, mimeType: MIME.webp });
    previousLongest = longest;
  }
  return outputs;
}

/** Dimensions of an image (SVG included) or null when unreadable. */
export async function readImageDimensions(data: Uint8Array): Promise<{ width: number; height: number } | null> {
  try {
    const meta = await sharp(data, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();
    const width = meta.autoOrient?.width ?? meta.width;
    const height = meta.autoOrient?.height ?? meta.height;
    return width && height ? { width, height } : null;
  } catch {
    return null;
  }
}
