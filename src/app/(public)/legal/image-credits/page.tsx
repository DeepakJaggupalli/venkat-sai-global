import { ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";

import { buildPageMetadata } from "@/components/public/server";
import { IMAGE_CREDITS } from "@/content/image-credits";

import { PublicHero } from "../../news/_components/public-hero";

export const metadata: Metadata = buildPageMetadata({
  title: "Image credits",
  description: "Credits and licences for the stock photographs and flag images used on the Venkat Sai Global website.",
  path: "/legal/image-credits",
});

const LINK = "inline-flex items-center gap-1 rounded-sm font-medium text-teal-strong underline-offset-4 hover:underline";

/**
 * Credits for every stock photograph on the public site (required for CC BY images, given for all of them) and
 * for the flag images. The photographs illustrate trades and places; they do not show Venkat Sai staff, trainees
 * or premises.
 */
export default function ImageCreditsPage() {
  return (
    <>
      <PublicHero
        eyebrow="Legal"
        title="Image credits"
        description="The photographs on this website are stock images that illustrate trades, industries and places. They do not show Venkat Sai staff, trainees or premises. Each one is listed here with its creator and licence."
        breadcrumbs={[{ label: "Image credits" }]}
      />
      <section aria-labelledby="photo-credits-title" className="container-page py-12 sm:py-16">
        <h2 id="photo-credits-title" className="font-display text-[1.75rem] text-foreground sm:text-[2.125rem]">
          Photographs
        </h2>
        <p className="mt-3 max-w-2xl text-base text-muted-foreground">
          Found through Openverse. Licences: CC0 and the Public Domain Mark (no rights reserved) and Creative Commons Attribution (credit required). Photos may be cropped and resized.
        </p>
        <ul className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3" data-testid="image-credits">
          {IMAGE_CREDITS.map((c) => (
            <li key={c.src} className="card-surface flex flex-col overflow-hidden rounded-2xl">
              <div className="relative aspect-[16/10] bg-surface-subtle">
                <Image src={c.src} alt={c.alt} fill sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw" className="object-cover" />
              </div>
              <div className="flex flex-1 flex-col gap-1.5 p-5 text-sm">
                <p className="font-heading text-base font-bold tracking-tight text-foreground">{c.title}</p>
                <p className="text-muted-foreground">By {c.creator}</p>
                <p className="mt-auto flex flex-wrap gap-x-4 gap-y-1 pt-3">
                  <a href={c.licenseUrl} target="_blank" rel="noopener noreferrer license" className={LINK}>
                    {c.license}
                    <ExternalLink aria-hidden="true" className="size-3.5" />
                    <span className="sr-only"> (licence, opens in a new tab)</span>
                  </a>
                  <a href={c.sourceUrl} target="_blank" rel="noopener noreferrer" className={LINK}>
                    Source
                    <ExternalLink aria-hidden="true" className="size-3.5" />
                    <span className="sr-only"> (original photo, opens in a new tab)</span>
                  </a>
                </p>
              </div>
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="flag-credits-title" className="container-page pb-16 sm:pb-24">
        <h2 id="flag-credits-title" className="font-display text-[1.75rem] text-foreground sm:text-[2.125rem]">
          Flags
        </h2>
        <p className="mt-3 max-w-2xl text-base text-muted-foreground">
          Country flags are SVG images from{" "}
          <a href="https://flagcdn.com" target="_blank" rel="noopener noreferrer" className={LINK}>
            flagcdn.com
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
          . National flag designs are in the public domain.
        </p>
      </section>
    </>
  );
}
