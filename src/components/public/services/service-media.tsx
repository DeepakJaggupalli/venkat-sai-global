import { CreditCard } from "lucide-react";

import { CmsImage, CmsVideo } from "@/components/public/cms-media";
import { cn } from "@/lib/utils";
import type { PublicMediaAsset } from "@/modules/content/types";

import { ServiceIllustration } from "./service-illustration";

/** First public image or video of an entry (hero image first, then its gallery). */
export function primaryMedia(hero: PublicMediaAsset | null, gallery: readonly PublicMediaAsset[]): PublicMediaAsset | null {
  if (hero && hero.kind === "image") return hero;
  return gallery.find((a) => a.kind === "image" || a.kind === "video" || a.kind === "embed") ?? null;
}

/**
 * Media area for a service or training family: the business's own photo or video from the CMS when there is
 * one, otherwise the designed illustration for the entry's icon.
 */
export function ServiceMedia({
  asset,
  iconName,
  title,
  className,
  sizes = "(min-width: 1024px) 40vw, 100vw",
  priority = false,
}: {
  asset: PublicMediaAsset | null;
  iconName?: string | null;
  title: string;
  className?: string;
  sizes?: string;
  priority?: boolean;
}) {
  if (asset?.kind === "image") {
    return (
      <div className={cn("aspect-[4/3] overflow-hidden rounded-2xl bg-surface-subtle", className)}>
        <CmsImage asset={asset} size="md" sizes={sizes} priority={priority} />
      </div>
    );
  }
  if (asset && (asset.kind === "video" || asset.kind === "embed")) {
    return <CmsVideo asset={asset} className={className} />;
  }
  return <ServiceIllustration iconName={iconName} className={cn("aspect-[4/3]", className)} label={`Illustration: ${title}`} />;
}

/**
 * Fees note for courses and internships. Online payment is not available yet (commercial.online_payments is off);
 * fees are confirmed when the visitor enquires. Shown on entries tagged "course-fee".
 */
export function FeeNote({ onlinePayments, className }: { onlinePayments: boolean; className?: string }) {
  return (
    <aside aria-labelledby="fee-note-title" className={cn("rounded-2xl border border-dashed border-navy/25 bg-white p-5", className)} data-testid="fee-note">
      <div className="flex flex-wrap items-center gap-3">
        <span aria-hidden="true" className="flex size-9 items-center justify-center rounded-lg bg-gold-soft text-gold-strong">
          <CreditCard className="size-4" />
        </span>
        <h3 id="fee-note-title" className="font-heading text-base font-semibold text-navy">
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
