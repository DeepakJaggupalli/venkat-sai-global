import Image from "next/image";

import { cn } from "@/lib/utils";
import type { AssetMap, PublicMediaAsset } from "@/modules/content/types";

/**
 * CMS media on the public site. Assets come from the content module already filtered to public, consented
 * items (`detail.assets`); a missing id simply means "not public", so nothing renders. Image files are
 * served as pre-generated WebP variants by the files module, hence `unoptimized`.
 */

export function pickAssets(map: AssetMap | undefined, ids: readonly (string | null | undefined)[] | null | undefined): PublicMediaAsset[] {
  if (!map || !ids) return [];
  return ids.map((id) => (id ? map[id] : undefined)).filter((a): a is PublicMediaAsset => Boolean(a));
}

export function pickAsset(map: AssetMap | undefined, id: string | null | undefined): PublicMediaAsset | null {
  return id && map ? (map[id] ?? null) : null;
}

function imageSrc(asset: PublicMediaAsset, size: "thumb" | "md" | "lg"): string {
  if (size === "thumb") return asset.variants.thumb ?? asset.variants.md ?? asset.url;
  if (size === "md") return asset.variants.md ?? asset.variants.lg ?? asset.url;
  return asset.variants.lg ?? asset.url;
}

export function CmsImage({
  asset,
  size = "lg",
  className,
  priority = false,
  sizes = "(min-width: 1024px) 50vw, 100vw",
}: {
  asset: PublicMediaAsset;
  size?: "thumb" | "md" | "lg";
  className?: string;
  priority?: boolean;
  sizes?: string;
}) {
  if (asset.kind !== "image") return null;
  const width = asset.width ?? 1600;
  const height = asset.height ?? 1000;
  return (
    <Image
      src={imageSrc(asset, size)}
      alt={asset.alt ?? ""}
      width={width}
      height={height}
      sizes={sizes}
      priority={priority}
      unoptimized
      className={cn("h-full w-full object-cover", className)}
    />
  );
}

/** An embedded YouTube/Vimeo player or an uploaded video, with a title for assistive technology. */
export function CmsVideo({ asset, className }: { asset: PublicMediaAsset; className?: string }) {
  if (asset.kind === "embed" && asset.embedUrl) {
    return (
      <div className={cn("relative aspect-video overflow-hidden rounded-xl bg-navy-deep", className)}>
        <iframe
          src={asset.embedUrl}
          title={asset.title || "Video"}
          loading="lazy"
          allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          referrerPolicy="strict-origin-when-cross-origin"
          className="absolute inset-0 size-full border-0"
        />
      </div>
    );
  }
  if (asset.kind === "video") {
    return (
      <video controls preload="metadata" className={cn("aspect-video w-full rounded-xl bg-navy-deep", className)} poster={asset.thumbnailUrl ?? undefined}>
        <source src={asset.url} type={asset.mimeType ?? undefined} />
        {asset.title}
      </video>
    );
  }
  return null;
}

/** One media item in a figure (image, uploaded video or embed) with its caption and credit. */
export function CmsFigure({ asset, className, imageClassName }: { asset: PublicMediaAsset; className?: string; imageClassName?: string }) {
  const caption = [asset.caption, asset.credit ? `Credit: ${asset.credit}` : null].filter(Boolean).join(" · ");
  return (
    <figure className={cn("overflow-hidden", className)}>
      {asset.kind === "image" ? (
        <div className={cn("overflow-hidden rounded-xl bg-surface-subtle", imageClassName)}>
          <CmsImage asset={asset} size="md" sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw" />
        </div>
      ) : (
        <CmsVideo asset={asset} />
      )}
      {caption ? <figcaption className="mt-2 text-sm text-muted-foreground">{caption}</figcaption> : null}
    </figure>
  );
}

/** Responsive gallery of public media. Renders nothing when there is nothing public to show. */
export function MediaGallery({ assets, className }: { assets: readonly PublicMediaAsset[]; className?: string }) {
  if (!assets.length) return null;
  return (
    <ul className={cn("grid gap-6 sm:grid-cols-2 lg:grid-cols-3", className)}>
      {assets.map((asset) => (
        <li key={asset.id}>
          <CmsFigure asset={asset} imageClassName="aspect-[4/3]" />
        </li>
      ))}
    </ul>
  );
}
