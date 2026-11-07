"use client";

import { ChevronLeft, ChevronRight, ImageIcon, Play, X } from "lucide-react";
import { useCallback, useState, type KeyboardEvent } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

import { VideoEmbed } from "../../videos/_components/video-embed";

/** Serializable gallery item prepared on the server from public media assets. */
export type GalleryItem = {
  id: string;
  kind: "image" | "video" | "embed";
  title: string;
  /** Text alternative ("" = decorative; galleries always describe images, so editors must add it). */
  alt: string;
  caption: string | null;
  credit: string | null;
  /** Full-size URL (image variant or video file). */
  src: string;
  thumbnail: string | null;
  mimeType: string | null;
  embedUrl: string | null;
  embedProvider: "youtube" | "vimeo" | null;
};

/**
 * Thumbnail grid + accessible lightbox: each thumbnail is a button; the dialog traps focus, closes on
 * Escape, returns focus to the thumbnail, and supports ← / → (and on-screen buttons) to move between items.
 */
export function MediaGallery({ items, label, className }: { items: GalleryItem[]; label: string; className?: string }) {
  const [index, setIndex] = useState<number | null>(null);
  const open = index !== null;
  const current = index !== null ? items[index] : null;
  const count = items.length;

  const go = useCallback((delta: number) => setIndex((i) => (i === null ? i : (i + delta + count) % count)), [count]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (count < 2) return;
    if (event.key === "ArrowRight") {
      event.preventDefault();
      go(1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      go(-1);
    }
  };

  if (!count) return null;

  return (
    <>
      <ul aria-label={label} className={cn("grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4", className)}>
        {items.map((item, i) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => setIndex(i)}
              className="group relative block aspect-square w-full overflow-hidden rounded-lg bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {item.thumbnail ? (
                // Media-library variants are already sized WebP; plain <img> keeps the grid light.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.thumbnail} alt="" loading="lazy" className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100" />
              ) : (
                <span aria-hidden="true" className="flex size-full items-center justify-center bg-gradient-to-br from-navy/10 to-teal-soft text-navy/40">
                  <ImageIcon className="size-8" />
                </span>
              )}
              {item.kind !== "image" ? (
                <span aria-hidden="true" className="absolute inset-0 flex items-center justify-center">
                  <span className="rounded-full bg-white/90 p-2.5 text-navy shadow">
                    <Play className="size-5 fill-current" />
                  </span>
                </span>
              ) : null}
              <span className="sr-only">
                {item.kind === "image" ? "Open image" : "Open video"} {i + 1} of {count}
                {item.alt || item.title ? `: ${item.alt || item.title}` : ""}
              </span>
            </button>
          </li>
        ))}
      </ul>

      <Dialog open={open} onOpenChange={(next) => !next && setIndex(null)}>
        <DialogContent showCloseButton={false} onKeyDown={onKeyDown} className="w-full max-w-[calc(100%-1rem)] gap-0 overflow-hidden bg-navy-deep p-0 text-white ring-white/10 sm:max-w-5xl">
          {current ? (
            <>
              <div className="flex items-center justify-between gap-3 px-4 py-3">
                <DialogTitle className="truncate text-sm font-semibold text-white">{current.title || (current.kind === "image" ? "Image" : "Video")}</DialogTitle>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-xs text-white/80" aria-live="polite">
                    {(index ?? 0) + 1} of {count}
                  </span>
                  <DialogClose asChild>
                    <Button variant="ghost" size="icon-sm" className="text-white hover:bg-white/10 hover:text-white">
                      <X aria-hidden="true" />
                      <span className="sr-only">Close</span>
                    </Button>
                  </DialogClose>
                </div>
              </div>
              <div className="relative flex min-h-[40vh] items-center justify-center bg-black/40">
                {current.kind === "image" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={current.src} alt={current.alt} className="max-h-[70vh] w-auto max-w-full object-contain" />
                ) : current.kind === "embed" && current.embedUrl && current.embedProvider ? (
                  <VideoEmbed key={current.id} embedUrl={current.embedUrl} provider={current.embedProvider} title={current.title || "Video"} posterUrl={current.thumbnail} className="w-full rounded-none border-0" />
                ) : (
                  <video key={current.id} src={current.src} controls preload="metadata" className="max-h-[70vh] w-full" aria-label={current.title || "Video"}>
                    <track kind="captions" />
                  </video>
                )}
                {count > 1 ? (
                  <>
                    <Button type="button" variant="secondary" size="icon" onClick={() => go(-1)} className="absolute top-1/2 left-2 -translate-y-1/2 rounded-full bg-white/90 text-navy hover:bg-white">
                      <ChevronLeft aria-hidden="true" />
                      <span className="sr-only">Previous</span>
                    </Button>
                    <Button type="button" variant="secondary" size="icon" onClick={() => go(1)} className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full bg-white/90 text-navy hover:bg-white">
                      <ChevronRight aria-hidden="true" />
                      <span className="sr-only">Next</span>
                    </Button>
                  </>
                ) : null}
              </div>
              <DialogDescription asChild>
                <div className="space-y-1 px-4 py-3 text-sm text-white/90">
                  {current.caption ? <p>{current.caption}</p> : null}
                  {current.credit ? <p className="text-xs text-white/75">Credit: {current.credit}</p> : null}
                  {!current.caption && !current.credit ? <p className="sr-only">Use the left and right arrow keys to move between items.</p> : null}
                </div>
              </DialogDescription>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
