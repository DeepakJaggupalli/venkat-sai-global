import { CreditCard } from "lucide-react";

import { CmsImage, CmsVideo } from "@/components/public/cms-media";
import { StockImage } from "@/components/public/stock-image";
import { stockPhotoFor } from "@/content/stock-photos";
import { cn } from "@/lib/utils";
import type { PublicMediaAsset } from "@/modules/content/types";

/** First public image or video of an entry (hero image first, then its gallery). */
export function primaryMedia(hero: PublicMediaAsset | null, gallery: readonly PublicMediaAsset[]): PublicMediaAsset | null {
  if (hero && hero.kind === "image") return hero;
  return gallery.find((a) => a.kind === "image" || a.kind === "video" || a.kind === "embed") ?? null;
}

/**
 * Media area for a service or training family: the business's own photo or video from the CMS when there is
 * one, otherwise a credited stock photograph chosen by the entry's slug or icon (src/content/stock-photos.ts).
 */
export function ServiceMedia({
  asset,
  iconName,
  slug,
  className,
  sizes = "(min-width: 1024px) 40vw, 100vw",
  priority = false,
  decorative = false,
  zoomOnHover = false,
}: {
  asset: PublicMediaAsset | null;
  iconName?: string | null;
  /** Entry slug, used to pick the stock photograph. */
  slug?: string | null;
  /** @deprecated kept for older call sites; alt text comes from the asset or the photo credit. */
  title?: string;
  className?: string;
  sizes?: string;
  priority?: boolean;
  /** Next to a title that says the same thing: empty alt for the stock photo. */
  decorative?: boolean;
  /** Card use: the picture zooms 3% when the card is hovered. */
  zoomOnHover?: boolean;
}) {
  const zoom = zoomOnHover ? "transition-transform duration-500 group-hover:scale-[1.03] motion-reduce:transition-none" : undefined;
  if (asset?.kind === "image") {
    return (
      <div className={cn("relative aspect-[4/3] overflow-hidden rounded-2xl bg-surface-subtle", className)}>
        <CmsImage asset={asset} size="md" sizes={sizes} priority={priority} className={cn("absolute inset-0", zoom)} />
      </div>
    );
  }
  if (asset && (asset.kind === "video" || asset.kind === "embed")) {
    return <CmsVideo asset={asset} className={className} />;
  }
  return (
    <div className={cn("relative aspect-[4/3] overflow-hidden rounded-2xl bg-surface-subtle", className)}>
      <StockImage photo={stockPhotoFor({ slug, iconName })} sizes={sizes} priority={priority} decorative={decorative} className={zoom} />
    </div>
  );
}

/**
 * Fees note for courses and internships. Online payment is not available yet (commercial.online_payments is off);
 * fees are confirmed when the visitor enquires. Shown on entries tagged "course-fee".
 */
export function FeeNote({ onlinePayments, className }: { onlinePayments: boolean; className?: string }) {
  return (
    <aside aria-labelledby="fee-note-title" className={cn("rounded-2xl border border-border bg-white p-5 sm:p-6", className)} data-testid="fee-note">
      <div className="flex flex-wrap items-center gap-3">
        <span aria-hidden="true" className="flex size-9 items-center justify-center rounded-full bg-teal-soft text-teal-strong">
          <CreditCard className="size-4" />
        </span>
        <h3 id="fee-note-title" className="font-heading text-base font-bold tracking-tight text-foreground">
          Fees and payment
        </h3>
        {onlinePayments ? null : <span className="rounded-full bg-info-soft px-2.5 py-0.5 text-xs font-semibold text-info">Online payment coming soon</span>}
      </div>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        The fee, duration and batch dates are confirmed when you enquire, before you pay anything. Course and internship fees are never a condition of
        a job application, offer or placement.
      </p>
    </aside>
  );
}
