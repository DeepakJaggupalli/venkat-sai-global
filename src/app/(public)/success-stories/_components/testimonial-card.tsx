import { Quote } from "lucide-react";

import { UserAvatar } from "@/components/shared/avatars";
import { cn } from "@/lib/utils";
import { TESTIMONIAL_TYPE_OPTIONS } from "@/modules/content/collections";
import type { AssetMap, PublishedEntry } from "@/modules/content/types";

import { imageSrc } from "../../news/_components/cms-image";

const TYPE_LABEL: Record<string, string> = Object.fromEntries(TESTIMONIAL_TYPE_OPTIONS.map((o) => [o.value, o.label]));

/** A consented testimonial: the person's own words, name, role and organisation. */
export function TestimonialCard({ entry, assets, className }: { entry: PublishedEntry<"testimonials">; assets: AssetMap; className?: string }) {
  const d = entry.data;
  const photo = d.photoAssetId ? assets[d.photoAssetId] : null;
  const role = [d.personRole, d.organisationName].filter(Boolean).join(", ");
  return (
    <figure className={cn("flex h-full flex-col rounded-xl border border-border/80 bg-card p-6 shadow-xs", className)}>
      <Quote className="size-6 text-teal" aria-hidden="true" />
      <blockquote className="mt-3 flex-1 text-base leading-7 text-foreground">
        <p className="whitespace-pre-line">{d.quote}</p>
      </blockquote>
      <figcaption className="mt-5 flex items-center gap-3 border-t border-border/70 pt-4">
        <UserAvatar name={d.personName} src={photo && photo.kind === "image" ? imageSrc(photo, "thumb") : null} size="md" />
        <div className="min-w-0 text-sm">
          <p className="font-semibold text-navy">{d.personName}</p>
          {role ? <p className="text-muted-foreground">{role}</p> : null}
          <p className="text-xs text-muted-foreground">{TYPE_LABEL[d.type] ?? "Testimonial"}</p>
        </div>
      </figcaption>
    </figure>
  );
}
