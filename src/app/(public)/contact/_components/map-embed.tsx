"use client";

import { MapPin } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

/**
 * Click-to-load map: nothing is requested from Google Maps / OpenStreetMap until the visitor asks for it,
 * so no third-party cookies are set beforehand. The URL is an embed link validated by the content module.
 */
export function MapEmbed({ src, title, provider }: { src: string; title: string; provider: string }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl border border-border/80 bg-surface-subtle sm:aspect-[16/9]">
      {loaded ? (
        <iframe src={src} title={title} className="absolute inset-0 size-full" loading="lazy" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
          <MapPin className="size-8 text-teal" aria-hidden="true" />
          <Button type="button" variant="outline" onClick={() => setLoaded(true)}>
            Show map
          </Button>
          <p className="max-w-xs text-xs leading-5 text-muted-foreground">Showing the map loads it from {provider}, which may set its own cookies.</p>
        </div>
      )}
    </div>
  );
}
