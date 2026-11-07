import Image from "next/image";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import type { PublicMediaAsset } from "@/modules/content/types";

type Variant = "thumb" | "md" | "lg";

/** Best URL for an image asset (generated WebP variants first, then the original). */
export function imageSrc(asset: PublicMediaAsset, variant: Variant = "lg"): string {
  const v = asset.variants;
  const pick = variant === "thumb" ? (v.thumb ?? v.md ?? v.lg) : variant === "md" ? (v.md ?? v.lg ?? v.thumb) : (v.lg ?? v.md);
  return pick ?? (asset.kind === "image" ? asset.url : (asset.thumbnailUrl ?? asset.url));
}

/**
 * A public CMS image in a fixed-ratio frame (object-cover). Alt text comes from the media library
 * ("" = decorative). Generated variants are already sized WebP, so they skip the optimiser.
 */
export function CmsImage({
  asset,
  variant = "lg",
  sizes = "(min-width: 1024px) 50vw, 100vw",
  aspect = "aspect-[16/9]",
  className,
  imgClassName,
  priority,
  alt,
}: {
  asset: PublicMediaAsset;
  variant?: Variant;
  sizes?: string;
  aspect?: string;
  className?: string;
  imgClassName?: string;
  priority?: boolean;
  /** Override the library alt text (e.g. "" when a visible caption repeats it). */
  alt?: string;
}) {
  const src = imageSrc(asset, variant);
  const hasVariant = Boolean(asset.variants.thumb || asset.variants.md || asset.variants.lg);
  const unoptimized = hasVariant || asset.mimeType === "image/svg+xml" || /\.svg($|\?)/i.test(src);
  return (
    <div className={cn("relative overflow-hidden bg-muted", aspect, className)}>
      <Image src={src} alt={alt ?? asset.alt ?? ""} fill sizes={sizes} priority={priority} unoptimized={unoptimized} className={cn("object-cover", imgClassName)} />
    </div>
  );
}

/** Decorative placeholder used when an entry has no public image. */
export function ImagePlaceholder({ icon, aspect = "aspect-[16/9]", className }: { icon: ReactNode; aspect?: string; className?: string }) {
  return (
    <div aria-hidden="true" className={cn("flex items-center justify-center bg-gradient-to-br from-navy/[0.06] via-teal-soft to-gold-soft/60 text-navy/35 [&_svg]:size-10", aspect, className)}>
      {icon}
    </div>
  );
}
