/**
 * Browser-side image shrinking for one-file-at-a-time uploads: photos straight from a phone camera are often larger
 * than the 4 MB limit. JPEG/PNG/WebP images over `maxBytes` (or with a side longer than `maxSide`) are redrawn on a
 * canvas as JPEG, lowering the quality until the file fits. PDFs and small images are returned unchanged.
 */
export async function shrinkImageIfNeeded(file: File, opts: { maxBytes: number; maxSide?: number }): Promise<File> {
  const maxSide = opts.maxSide ?? 2480;
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return file;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }
  const longest = Math.max(bitmap.width, bitmap.height);
  if (file.size <= opts.maxBytes && longest <= maxSide) {
    bitmap.close();
    return file;
  }
  const scale = Math.min(1, maxSide / longest);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    return file;
  }
  // White background so transparent PNGs do not turn black as JPEG.
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const baseName = file.name.replace(/\.[^.]+$/, "") || "photo";
  for (const quality of [0.86, 0.78, 0.7, 0.6, 0.5]) {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (blob && blob.size <= opts.maxBytes) return new File([blob], `${baseName}.jpg`, { type: "image/jpeg" });
  }
  return file;
}
