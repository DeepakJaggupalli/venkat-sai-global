"use client";

import { ExternalLink, Play } from "lucide-react";
import { useRef, useState } from "react";

import { cn } from "@/lib/utils";
import { track } from "@/modules/analytics/client";

const PROVIDER_LABEL = { youtube: "YouTube", vimeo: "Vimeo" } as const;

function withAutoplay(url: string): string {
  return `${url}${url.includes("?") ? "&" : "?"}autoplay=1`;
}

/**
 * Click-to-load video player. Nothing is requested from YouTube (privacy-enhanced youtube-nocookie.com)
 * or Vimeo until the visitor chooses to play, so no third-party cookies are set before that choice.
 */
export function VideoEmbed({
  embedUrl,
  provider,
  title,
  posterUrl,
  watchUrl,
  className,
}: {
  /** Normalised player URL from the content module (youtube-nocookie / player.vimeo.com). */
  embedUrl: string;
  provider: "youtube" | "vimeo";
  title: string;
  posterUrl?: string | null;
  watchUrl?: string | null;
  className?: string;
}) {
  const [loaded, setLoaded] = useState(false);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const providerLabel = PROVIDER_LABEL[provider];

  return (
    <figure className={cn("overflow-hidden rounded-xl border border-border/80 bg-card", className)}>
      <div className="relative aspect-video w-full bg-navy-deep">
        {loaded ? (
          <iframe
            ref={frameRef}
            src={withAutoplay(embedUrl)}
            title={title}
            className="absolute inset-0 size-full"
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            loading="lazy"
          />
        ) : (
          <>
            {posterUrl ? (
              // Poster images come from the media library (public files); decorative here.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={posterUrl} alt="" className="absolute inset-0 size-full object-cover opacity-80" loading="lazy" />
            ) : (
              <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-br from-navy via-navy-deep to-teal/40" />
            )}
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-navy-deep/40 p-4 text-center text-white">
              <button
                type="button"
                onClick={() => {
                  setLoaded(true);
                  track("cta_click", { cta: "video_load", provider });
                }}
                className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-semibold text-navy shadow-lg transition hover:bg-white/90 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
              >
                <Play className="size-5 fill-current" aria-hidden="true" />
                Play video<span className="sr-only">: {title}</span>
              </button>
              <p className="max-w-sm text-xs leading-5 text-white/90">Playing loads the video from {providerLabel}, which may set its own cookies.</p>
            </div>
          </>
        )}
      </div>
      {watchUrl ? (
        <figcaption className="flex justify-end border-t border-border/70 px-4 py-2 text-xs">
          <a href={watchUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-teal-strong underline-offset-2 hover:underline">
            Watch on {providerLabel}
            <ExternalLink className="size-3.5" aria-hidden="true" />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        </figcaption>
      ) : null}
    </figure>
  );
}
