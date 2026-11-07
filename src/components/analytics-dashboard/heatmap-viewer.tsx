"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import type { ViewportBucket } from "@/modules/analytics/privacy-rules";
import type { HeatmapCell } from "@/modules/analytics/types";

import { cellRects, fitScale, HEAT_RAMP, heatColor, VIEWPORT_WIDTHS, visibleRects } from "./heatmap-utils";

const FRAME_HEIGHT: Record<ViewportBucket, number> = { mobile: 780, tablet: 1000, desktop: 760 };

/**
 * Click-density overlay. The live page is rendered in a same-origin iframe at the bucket's viewport
 * width (scaled down to fit), and a canvas on top redraws the cells for the iframe's current scroll
 * position, so the overlay stays aligned while you scroll the page. Paths with replaced identifiers
 * (e.g. /jobs/[id]) cannot be opened, so they get the density map on a blank canvas of the recorded height.
 */
export function HeatmapViewer({
  path,
  viewport,
  cells,
  docHeight,
  previewable,
  totalClicks,
}: {
  path: string;
  viewport: ViewportBucket;
  cells: HeatmapCell[];
  docHeight: number | null;
  previewable: boolean;
  totalClicks: number;
}) {
  const id = useId();
  const width = VIEWPORT_WIDTHS[viewport];
  const frameHeight = FRAME_HEIGHT[viewport];
  const wrapRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const blankScrollRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [showOverlay, setShowOverlay] = useState(true);
  const [frameState, setFrameState] = useState<"loading" | "ready" | "failed">(previewable ? "loading" : "failed");
  const docWidthRef = useRef<number>(width);
  const scrollTopRef = useRef(0);

  const rectsFor = useMemo(() => (docWidth: number) => cellRects(cells, docWidth), [cells]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(width * dpr)) canvas.width = Math.round(width * dpr);
    if (canvas.height !== Math.round(frameHeight * dpr)) canvas.height = Math.round(frameHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, frameHeight);
    if (!showOverlay) return;
    const top = scrollTopRef.current;
    for (const r of visibleRects(rectsFor(docWidthRef.current), top, frameHeight)) {
      ctx.fillStyle = heatColor(r.density);
      ctx.fillRect(r.x, r.y - top, Math.max(2, r.width), r.height);
    }
  }, [frameHeight, rectsFor, showOverlay, width]);

  // Fit the fixed-width stage into the available width.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => setScale(fitScale(el.clientWidth, width));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [width]);

  useEffect(() => {
    draw();
  }, [draw]);

  // Same-origin iframe: follow its scroll position.
  useEffect(() => {
    if (!previewable) return;
    const iframe = iframeRef.current;
    if (!iframe) return;
    let detach: (() => void) | undefined;
    const onLoad = () => {
      detach?.();
      try {
        const win = iframe.contentWindow;
        if (!win) throw new Error("no window");
        docWidthRef.current = win.document.documentElement.clientWidth || width;
        const onScroll = () => {
          scrollTopRef.current = win.scrollY;
          window.requestAnimationFrame(draw);
        };
        win.addEventListener("scroll", onScroll, { passive: true });
        detach = () => win.removeEventListener("scroll", onScroll);
        scrollTopRef.current = win.scrollY;
        setFrameState("ready");
        draw();
      } catch {
        setFrameState("failed");
      }
    };
    iframe.addEventListener("load", onLoad);
    // Already loaded (cached page, or this effect re-ran after a redraw setting changed): attach now.
    try {
      if (iframe.contentDocument?.readyState === "complete" && iframe.contentWindow?.location.href !== "about:blank") onLoad();
    } catch {
      // Cross-origin or blocked frame: report it after this effect, not synchronously inside it.
      queueMicrotask(() => setFrameState("failed"));
    }
    return () => {
      iframe.removeEventListener("load", onLoad);
      detach?.();
    };
  }, [draw, previewable, width]);

  const blankHeight = Math.max(frameHeight, docHeight ?? 0);
  const summary = `Click density for ${path} on ${viewport}: ${totalClicks.toLocaleString("en-IN")} clicks in ${cells.length.toLocaleString("en-IN")} areas. Darker areas received more clicks. The most clicked elements are listed in the table below.`;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Checkbox id={`${id}-overlay`} checked={showOverlay} onCheckedChange={(v) => setShowOverlay(v === true)} />
          <Label htmlFor={`${id}-overlay`}>Show click overlay</Label>
        </div>
        <HeatLegend />
      </div>
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {previewable
          ? frameState === "loading"
            ? "Loading the live page…"
            : frameState === "ready"
              ? "Scroll inside the page; the overlay follows. Links in the preview are live but open inside the frame."
              : "The live page could not be loaded in the frame, so the overlay is shown without it."
          : "This path contains replaced identifiers, so there is no single live page to show. The overlay is drawn on a blank canvas of the recorded page height."}
      </p>

      <div ref={wrapRef} className="w-full overflow-hidden rounded-xl border bg-surface-subtle" style={{ height: frameHeight * scale }}>
        <div ref={stageRef} className="relative origin-top-left" style={{ width, height: frameHeight, transform: `scale(${scale})` }}>
          {previewable && frameState !== "failed" ? (
            <iframe
              ref={iframeRef}
              src={path}
              title={`Live preview of ${path}`}
              width={width}
              height={frameHeight}
              sandbox="allow-same-origin allow-scripts"
              referrerPolicy="same-origin"
              className="block border-0 bg-white"
            />
          ) : (
            <div
              ref={blankScrollRef}
              className="h-full overflow-y-auto bg-white"
              tabIndex={0}
              aria-label="Blank page canvas, scroll to move through the recorded page height"
              onScroll={(e) => {
                scrollTopRef.current = e.currentTarget.scrollTop;
                window.requestAnimationFrame(draw);
              }}
            >
              <div className="bg-[linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] bg-[length:100%_100px]" style={{ height: blankHeight }} />
            </div>
          )}
          <canvas ref={canvasRef} role="img" aria-label={summary} className="pointer-events-none absolute inset-0" style={{ width, height: frameHeight }} />
        </div>
      </div>
    </div>
  );
}

/** Sequential legend: one hue, light (few clicks) → dark (many). */
export function HeatLegend() {
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <span>Fewer clicks</span>
      <span
        aria-hidden="true"
        className="h-2.5 w-28 rounded-full"
        style={{ background: `linear-gradient(to right, ${HEAT_RAMP.join(", ")})` }}
      />
      <span>More clicks</span>
    </div>
  );
}
