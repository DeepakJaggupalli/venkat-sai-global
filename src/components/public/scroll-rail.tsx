"use client";

import { useContext, useEffect, useRef, type ReactNode } from "react";

import { usePrefersReducedMotion } from "@/hooks/use-reduced-motion";
import { cn } from "@/lib/utils";

import { RailsPausedContext } from "./pausable-rails";

/** Auto-scroll speeds in px per second. */
export const RAIL_SPEED = { slow: 22, normal: 34, fast: 50 } as const;

/** Pause after the visitor stops touching, dragging, scrolling or hovering. */
const RESUME_AFTER_MS = 3000;

/**
 * A horizontally scrollable rail (hidden scrollbar) that also moves on its own. The items are rendered twice
 * (the copy is aria-hidden and inert) and scrollLeft wraps by one list width, so it loops seamlessly in both
 * directions. Visitors can swipe, drag with the mouse, use a trackpad or shift + wheel, or the arrow keys
 * (the rail is focusable). Auto-scroll pauses while the rail is hovered, focused, dragged or touched, resumes
 * ~3 s after the visitor stops, stops with the surrounding pause button (`PausableRails`) and never runs for
 * reduced-motion visitors (they get one plain scrollable list). Always left-to-right, also on the Arabic page.
 */
export function ScrollRail({
  label,
  children,
  reverse = false,
  speed = "normal",
  className,
}: {
  /** Accessible name for the rail. */
  label: string;
  /** The <li> items. */
  children: ReactNode;
  reverse?: boolean;
  speed?: keyof typeof RAIL_SPEED;
  className?: string;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const copy = useRef<HTMLUListElement>(null);
  const paused = useContext(RailsPausedContext);
  const reduced = usePrefersReducedMotion();
  const stopped = useRef(true);

  useEffect(() => {
    stopped.current = paused || reduced;
  }, [paused, reduced]);

  useEffect(() => {
    const el = scroller.current;
    const second = copy.current;
    if (!el || !second) return;
    let hovered = false;
    let focused = false;
    let touching = false;
    let drag: { x: number; moved: number; id: number } | null = null;
    let suppressClick = false;
    let resumeAt = 0;
    let pos = el.scrollLeft;
    let last = 0;
    let running = false;
    let frame = 0;

    /** Width of one list (the copy starts right after it); 0 when the copy is hidden or the list fits. */
    const span = () => {
      const width = second.offsetLeft - (el.firstElementChild as HTMLElement).offsetLeft;
      return second.offsetParent && width > el.clientWidth ? width : 0;
    };
    /** Keep the position inside (0, width] so there is always room to scroll both ways. */
    const wrap = (x: number) => {
      const w = span();
      if (!w) return x;
      if (x <= 0) return x + w;
      if (x > w) return x - w;
      return x;
    };
    const nudge = () => {
      resumeAt = performance.now() + RESUME_AFTER_MS;
    };

    const tick = (now: number) => {
      const active = !stopped.current && !hovered && !focused && !touching && !drag && now >= resumeAt && span() > 0;
      if (active) {
        if (!running) pos = el.scrollLeft;
        const dt = last ? Math.min(now - last, 100) : 0;
        pos = wrap(pos + ((reverse ? -1 : 1) * RAIL_SPEED[speed] * dt) / 1000);
        el.scrollLeft = pos;
      }
      running = active;
      last = now;
      frame = requestAnimationFrame(tick);
    };

    const onScroll = () => {
      if (running) return;
      const x = el.scrollLeft;
      const wrapped = wrap(x);
      if (wrapped !== x) el.scrollLeft = wrapped;
    };
    const onWheel = (e: WheelEvent) => {
      nudge();
      // Shift + wheel scrolls sideways (plain vertical wheel keeps scrolling the page).
      if (e.shiftKey && e.deltaX === 0 && e.deltaY !== 0) {
        e.preventDefault();
        el.scrollLeft = wrap(el.scrollLeft + e.deltaY);
      }
    };
    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || e.button !== 0) return;
      drag = { x: e.clientX, moved: 0, id: e.pointerId };
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x;
      drag.x = e.clientX;
      drag.moved += Math.abs(dx);
      if (drag.moved > 4 && !el.hasPointerCapture(e.pointerId)) el.setPointerCapture(e.pointerId);
      el.scrollLeft = wrap(el.scrollLeft - dx);
    };
    const onPointerUp = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      suppressClick = drag.moved > 4;
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
      drag = null;
      nudge();
    };
    const onClick = (e: MouseEvent) => {
      if (!suppressClick) return;
      suppressClick = false;
      e.preventDefault();
      e.stopPropagation();
    };
    const onDragStart = (e: DragEvent) => e.preventDefault();
    const onEnter = () => (hovered = true);
    const onLeave = () => {
      hovered = false;
      nudge();
    };
    const onFocusIn = () => (focused = true);
    const onFocusOut = (e: FocusEvent) => {
      if (el.contains(e.relatedTarget as Node | null)) return;
      focused = false;
      nudge();
    };
    const onTouchStart = () => (touching = true);
    const onTouchEnd = () => {
      touching = false;
      nudge();
    };

    const listeners: [string, EventListener, AddEventListenerOptions?][] = [
      ["scroll", onScroll as EventListener, { passive: true }],
      ["wheel", onWheel as EventListener, { passive: false }],
      ["pointerdown", onPointerDown as EventListener],
      ["pointermove", onPointerMove as EventListener],
      ["pointerup", onPointerUp as EventListener],
      ["pointercancel", onPointerUp as EventListener],
      ["click", onClick as EventListener, { capture: true }],
      ["dragstart", onDragStart as EventListener],
      ["mouseenter", onEnter],
      ["mouseleave", onLeave],
      ["focusin", onFocusIn],
      ["focusout", onFocusOut as EventListener],
      ["touchstart", onTouchStart, { passive: true }],
      ["touchend", onTouchEnd, { passive: true }],
      ["touchcancel", onTouchEnd, { passive: true }],
    ];
    for (const [type, fn, opts] of listeners) el.addEventListener(type, fn, opts);
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      for (const [type, fn, opts] of listeners) el.removeEventListener(type, fn, opts);
    };
  }, [reverse, speed]);

  return (
    <div
      ref={scroller}
      dir="ltr"
      role="region"
      aria-label={label}
      tabIndex={0}
      className={cn(
        "marquee-mask relative flex cursor-grab select-none overflow-x-auto overscroll-x-contain [scrollbar-width:none] focus-visible:outline-2 focus-visible:-outline-offset-2 active:cursor-grabbing [&::-webkit-scrollbar]:hidden",
        className,
      )}
      data-testid="scroll-rail"
    >
      <ul className="flex shrink-0 items-center">{children}</ul>
      <ul ref={copy} aria-hidden="true" inert className="flex shrink-0 items-center motion-reduce:hidden" data-marquee-copy>
        {children}
      </ul>
    </div>
  );
}
