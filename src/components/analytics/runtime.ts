/**
 * Browser analytics runtime — created by AnalyticsTrackerClient ONLY while the visitor has analytics
 * consent. It records page views, the track() queue, heatmap clicks (rage / dead clicks), scroll-depth
 * milestones, form starts/submits and CTA / outbound / download clicks, and sends them in batches to
 * POST /api/v1/collect with navigator.sendBeacon (fetch keepalive fallback).
 *
 * Never recorded: input values, keystrokes, clipboard, element text, anything inside
 * [data-analytics-ignore], query parameters outside the whitelist.
 */
import { ANALYTICS_SESSION_COOKIE, ANALYTICS_SESSION_TIMEOUT_MS, buildCookieString, generateRandomId, isRandomId } from "@/modules/analytics/consent";
import type { AnalyticsEvent, AnalyticsProps } from "@/modules/analytics/events";
import {
  buildSafeSelector,
  extractUtm,
  isTrackablePath,
  normalizeAnalyticsPath,
  pickAllowedQueryParams,
  referrerDomainFrom,
  sanitizeAnalyticsKey,
  sanitizeEventProps,
  viewportBucket,
  type SafeEventProps,
  type UtmParams,
} from "@/modules/analytics/privacy-rules";
import { COLLECT_LIMITS } from "@/modules/analytics/limits";

const SESSION_KEY = "vsg_a_session";
const VISITOR_KEY = "vsg_a_visitor";
const ENDPOINT = "/api/v1/collect";
const FLUSH_DELAY_MS = 4000;
const FLUSH_AT_EVENTS = 20;
const MAX_PAYLOAD_BYTES = 48 * 1024;
const SCROLL_MILESTONES = [25, 50, 75, 90, 100] as const;
const RAGE_CLICKS = 3;
const RAGE_WINDOW_MS = 700;
const RAGE_RADIUS_PX = 30;
const DEAD_CLICK_WAIT_MS = 1000;
const DOWNLOAD_RE = /\.(pdf|docx?|xlsx?|pptx?|csv|zip|rar|7z|txt|rtf|odt|ods|jpg|jpeg|png)$/i;

type PendingEvent = { name: string; path: string; props: SafeEventProps; ts: number };
type PendingHeat = { path: string; vw: "mobile" | "tablet" | "desktop"; x: number; y: number; h: number; sel: string | null; kind: "click" | "dead_click" | "rage_click"; ts: number };
type PendingScroll = { path: string; depth: number; ts: number };
type SessionStart = { landingPath: string; referrer: string | null; utm: UtmParams | null; locale: string | null; newVisitor: boolean };
type StoredSession = { id: string; lastActivity: number };

type QueuedTrack = { name: AnalyticsEvent; props?: AnalyticsProps; ts: number; path: string };

function safeStorage(kind: "local" | "session"): Storage | null {
  try {
    return kind === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

function readJson<T>(storage: Storage | null, key: string): T | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(storage: Storage | null, key: string, value: unknown): void {
  try {
    storage?.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or blocked: tracking continues for this page only.
  }
}

function setCookie(name: string, value: string, maxAgeSeconds: number): void {
  try {
    document.cookie = buildCookieString(name, value, { maxAgeSeconds, secure: window.location.protocol === "https:" });
  } catch {
    // ignore
  }
}

/** Remove the analytics identifiers (consent withdrawn or tracking disabled). */
export function clearAnalyticsIdentifiers(): void {
  safeStorage("local")?.removeItem(VISITOR_KEY);
  safeStorage("session")?.removeItem(SESSION_KEY);
  setCookie(ANALYTICS_SESSION_COOKIE, "", 0);
}

const INTERACTIVE_SELECTOR =
  'a[href],button,input,select,textarea,label,summary,details,option,[role="button"],[role="link"],[role="tab"],[role="menuitem"],[role="checkbox"],[role="switch"],[role="option"],[role="radio"],[role="slider"],[contenteditable="true"],[onclick],[tabindex]:not([tabindex="-1"])';

function isInteractive(el: Element): boolean {
  if (el.closest(INTERACTIVE_SELECTOR)) return true;
  try {
    return window.getComputedStyle(el).cursor === "pointer";
  } catch {
    return false;
  }
}

function documentSize(): { width: number; height: number } {
  const doc = document.documentElement;
  const body = document.body;
  return {
    width: Math.max(doc.scrollWidth, body?.scrollWidth ?? 0, doc.clientWidth, 1),
    height: Math.max(doc.scrollHeight, body?.scrollHeight ?? 0, doc.clientHeight, 1),
  };
}

export type RuntimeOptions = { heatmaps: boolean };

export class AnalyticsRuntime {
  private readonly heatmaps: boolean;
  private events: PendingEvent[] = [];
  private heat: PendingHeat[] = [];
  private scroll: PendingScroll[] = [];
  private pendingStart: SessionStart | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private visitorId: string;
  private visitorIsNew = false;
  private session: StoredSession | null = null;
  private referrerUsed = false;
  private currentPath: string | null = null;
  private reachedMilestones = new Set<number>();
  private startedForms = new Set<string>();
  private recentClicks: { x: number; y: number; t: number }[] = [];
  private rageReported = 0;
  private scrollFrame: number | null = null;
  private cleanups: (() => void)[] = [];
  private stopped = false;

  constructor(options: RuntimeOptions) {
    this.heatmaps = options.heatmaps;
    const local = safeStorage("local");
    const stored = readJson<{ id?: string }>(local, VISITOR_KEY);
    if (stored && isRandomId(stored.id)) {
      this.visitorId = stored.id;
    } else {
      this.visitorId = generateRandomId();
      this.visitorIsNew = true;
      writeJson(local, VISITOR_KEY, { id: this.visitorId, createdAt: Date.now() });
    }
  }

  /** Attach listeners and take over the global track() queue. */
  start(): void {
    const on = <K extends keyof DocumentEventMap>(type: K, handler: (event: DocumentEventMap[K]) => void, options?: AddEventListenerOptions) => {
      document.addEventListener(type, handler as EventListener, options);
      this.cleanups.push(() => document.removeEventListener(type, handler as EventListener, options));
    };
    on("click", (e) => this.onClick(e), { capture: true, passive: true });
    on("focusin", (e) => this.onFocusIn(e), { capture: true, passive: true });
    on("submit", (e) => this.onSubmit(e), { capture: true, passive: true });
    on("visibilitychange", () => {
      if (document.visibilityState === "hidden") this.flush(true);
    });
    const onScroll = () => this.onScroll();
    const onPageHide = () => this.flush(true);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pagehide", onPageHide);
    this.cleanups.push(() => window.removeEventListener("scroll", onScroll));
    this.cleanups.push(() => window.removeEventListener("pagehide", onPageHide));

    window.__vsgAnalyticsFlush = () => this.drainTrackQueue();
    this.drainTrackQueue();
  }

  /** Detach everything and send what is pending. */
  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    for (const cleanup of this.cleanups.splice(0)) cleanup();
    if (this.scrollFrame !== null) cancelAnimationFrame(this.scrollFrame);
    this.flush(true);
    if (this.timer) clearTimeout(this.timer);
    window.__vsgAnalyticsFlush = undefined;
  }

  /** Record a page view (route change). `search` is the raw query string; only whitelisted keys are kept. */
  pageView(pathname: string, search: string): void {
    const path = normalizeAnalyticsPath(pathname);
    if (!path || !isTrackablePath(path)) return;
    this.currentPath = path;
    this.reachedMilestones = new Set();
    this.startedForms = new Set();
    this.touchSession(path, search);
    this.push("page_view", path, pickAllowedQueryParams(search));
    // Short pages are fully visible without scrolling.
    window.setTimeout(() => this.onScroll(), 1200);
  }

  private touchSession(path: string, search: string): StoredSession {
    const storage = safeStorage("session");
    const now = Date.now();
    const stored = this.session ?? readJson<StoredSession>(storage, SESSION_KEY);
    if (stored && isRandomId(stored.id) && now - stored.lastActivity < ANALYTICS_SESSION_TIMEOUT_MS) {
      stored.lastActivity = now;
      this.session = stored;
    } else {
      // A new session: flush anything of the previous one first, then capture the entry context.
      if (this.session) this.flush(false);
      this.session = { id: generateRandomId(), lastActivity: now };
      const referrer = this.referrerUsed ? null : referrerDomainFrom(document.referrer, window.location.hostname);
      this.referrerUsed = true;
      this.pendingStart = {
        landingPath: path,
        referrer,
        utm: extractUtm(search),
        locale: document.documentElement.lang || null,
        newVisitor: this.visitorIsNew,
      };
      this.visitorIsNew = false;
    }
    writeJson(storage, SESSION_KEY, this.session);
    setCookie(ANALYTICS_SESSION_COOKIE, this.session.id, Math.round(ANALYTICS_SESSION_TIMEOUT_MS / 1000));
    return this.session;
  }

  private activePath(): string | null {
    const path = this.currentPath ?? normalizeAnalyticsPath(window.location.pathname);
    return path && isTrackablePath(path) ? path : null;
  }

  private push(name: string, path: string, props: AnalyticsProps | SafeEventProps): void {
    this.events.push({ name, path, props: sanitizeEventProps(props), ts: Date.now() });
    this.schedule(this.events.length >= FLUSH_AT_EVENTS);
  }

  private drainTrackQueue(): void {
    const queue = window.__vsgAnalyticsQueue;
    if (!queue?.length) return;
    const items = queue.splice(0, queue.length) as QueuedTrack[];
    // Activity keeps the session alive (or starts a new one after 30 idle minutes) before queuing.
    if (this.currentPath) this.touchSession(this.currentPath, "");
    for (const item of items) {
      const path = normalizeAnalyticsPath(item.path);
      if (!path || !isTrackablePath(path)) continue;
      this.events.push({ name: item.name, path, props: sanitizeEventProps(item.props), ts: item.ts });
    }
    this.schedule(this.events.length >= FLUSH_AT_EVENTS);
  }

  // -------------------------------------------------------------------------
  // Clicks: CTA / outbound / download events and heatmap points
  // -------------------------------------------------------------------------

  private onClick(event: MouseEvent): void {
    const target = event.target instanceof Element ? event.target : null;
    if (!target || target.closest("[data-analytics-ignore]")) return;
    const path = this.activePath();
    if (!path) return;

    const ctaEl = target.closest("[data-analytics-cta]");
    if (ctaEl) {
      const cta = sanitizeAnalyticsKey(ctaEl.getAttribute("data-analytics-cta"));
      const location = sanitizeAnalyticsKey(ctaEl.getAttribute("data-analytics-location"));
      if (cta) this.push("cta_click", path, { cta, ...(location ? { location } : {}) });
    }
    const anchor = target.closest("a[href]");
    if (anchor instanceof HTMLAnchorElement) this.onLinkClick(anchor, path);

    // Keyboard activation (detail 0) has no pointer position: not a heatmap point.
    if (!this.heatmaps || event.detail === 0) return;
    const size = documentSize();
    const vw = viewportBucket(window.innerWidth);
    const x = Math.min(1000, Math.max(0, Math.round((event.pageX / size.width) * 1000)));
    const y = Math.max(0, Math.round(event.pageY));
    const sel = buildSafeSelector(target);
    const ts = Date.now();
    this.heat.push({ path, vw, x, y, h: size.height, sel, kind: "click", ts });

    this.recentClicks = this.recentClicks.filter((c) => ts - c.t <= RAGE_WINDOW_MS);
    this.recentClicks.push({ x: event.clientX, y: event.clientY, t: ts });
    const near = this.recentClicks.filter((c) => Math.hypot(c.x - event.clientX, c.y - event.clientY) <= RAGE_RADIUS_PX);
    if (near.length >= RAGE_CLICKS && ts - this.rageReported > RAGE_WINDOW_MS) {
      this.rageReported = ts;
      this.heat.push({ path, vw, x, y, h: size.height, sel, kind: "rage_click", ts });
    }

    if (!isInteractive(target)) this.watchDeadClick({ path, vw, x, y, h: size.height, sel, kind: "dead_click", ts });
    this.schedule(this.heat.length >= COLLECT_LIMITS.maxHeatmapPoints);
  }

  private onLinkClick(anchor: HTMLAnchorElement, path: string): void {
    let url: URL;
    try {
      url = new URL(anchor.href, window.location.href);
    } catch {
      return;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") return;
    if (url.host !== window.location.host) {
      this.push("outbound_click", path, { domain: url.hostname.toLowerCase() });
      return;
    }
    const match = DOWNLOAD_RE.exec(url.pathname);
    if (anchor.hasAttribute("download") || match) {
      this.push("file_download", path, { extension: match?.[1]?.toLowerCase() ?? "file" });
    }
  }

  /** A click on a non-interactive element that changes nothing within a second is a dead click. */
  private watchDeadClick(point: PendingHeat): void {
    const href = window.location.href;
    let changed = false;
    const observer = new MutationObserver(() => {
      changed = true;
    });
    try {
      observer.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
    } catch {
      return;
    }
    window.setTimeout(() => {
      observer.disconnect();
      if (!changed && window.location.href === href && !this.stopped) {
        this.heat.push(point);
        this.schedule(false);
      }
    }, DEAD_CLICK_WAIT_MS);
  }

  // -------------------------------------------------------------------------
  // Scroll depth and forms
  // -------------------------------------------------------------------------

  private onScroll(): void {
    if (this.scrollFrame !== null || this.stopped) return;
    this.scrollFrame = requestAnimationFrame(() => {
      this.scrollFrame = null;
      const path = this.activePath();
      if (!path) return;
      const size = documentSize();
      const depth = Math.min(100, Math.round(((window.scrollY + window.innerHeight) / size.height) * 100));
      for (const milestone of SCROLL_MILESTONES) {
        if (depth >= milestone && !this.reachedMilestones.has(milestone)) {
          this.reachedMilestones.add(milestone);
          this.scroll.push({ path, depth: milestone, ts: Date.now() });
        }
      }
      if (this.scroll.length) this.schedule(false);
    });
  }

  private formIdFor(target: EventTarget | null): string | null {
    const el = target instanceof Element ? target : null;
    if (!el || el.closest("[data-analytics-ignore]")) return null;
    const form = el instanceof HTMLFormElement ? el : el.closest("form");
    if (!form || !form.hasAttribute("data-analytics-form")) return null;
    return sanitizeAnalyticsKey(form.getAttribute("data-analytics-form"));
  }

  /** First focus on a field of a tracked form (the field's value is never read). */
  private onFocusIn(event: FocusEvent): void {
    const el = event.target instanceof Element ? event.target : null;
    if (!el || !el.matches('input, select, textarea, [contenteditable="true"]')) return;
    const formId = this.formIdFor(el);
    const path = this.activePath();
    if (!formId || !path || this.startedForms.has(formId)) return;
    this.startedForms.add(formId);
    this.push("form_started", path, { formId });
  }

  private onSubmit(event: SubmitEvent): void {
    const formId = this.formIdFor(event.target);
    const path = this.activePath();
    if (!formId || !path) return;
    this.push("form_submitted", path, { formId });
    this.flush(true);
  }

  // -------------------------------------------------------------------------
  // Transport
  // -------------------------------------------------------------------------

  private schedule(immediate: boolean): void {
    if (this.stopped) return;
    if (immediate) {
      this.flush(false);
      return;
    }
    if (!this.timer) this.timer = setTimeout(() => this.flush(false), FLUSH_DELAY_MS);
  }

  /** Send everything pending (split into payloads within the collector limits). */
  flush(useBeacon: boolean): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (!this.session && (this.events.length || this.heat.length || this.scroll.length)) {
      const path = this.activePath();
      if (!path) return;
      this.touchSession(path, window.location.search);
    }
    const session = this.session;
    if (!session) return;
    while (this.pendingStart || this.events.length || this.heat.length || this.scroll.length) {
      const events = this.events.splice(0, COLLECT_LIMITS.maxEvents);
      const heatmap = this.heat.splice(0, COLLECT_LIMITS.maxHeatmapPoints);
      const scroll = this.scroll.splice(0, COLLECT_LIMITS.maxScrollRecords);
      const payload = {
        v: 1 as const,
        sid: session.id,
        vid: this.visitorId,
        sentAt: Date.now(),
        ...(this.pendingStart ? { start: this.pendingStart } : {}),
        events,
        heatmap,
        scroll,
      };
      this.pendingStart = null;
      this.send(payload, useBeacon);
    }
  }

  private send(payload: Record<string, unknown> & { events: PendingEvent[]; heatmap: PendingHeat[]; scroll: PendingScroll[] }, useBeacon: boolean): void {
    const body = JSON.stringify(payload);
    if (body.length > MAX_PAYLOAD_BYTES && (payload.events.length > 1 || payload.heatmap.length > 1)) {
      const half = <T>(list: T[]): [T[], T[]] => [list.slice(0, Math.ceil(list.length / 2)), list.slice(Math.ceil(list.length / 2))];
      const [e1, e2] = half(payload.events);
      const [h1, h2] = half(payload.heatmap);
      this.send({ ...payload, events: e1, heatmap: h1 }, useBeacon);
      // The second half must not repeat the session start or the scroll records.
      const rest: typeof payload = { ...payload, events: e2, heatmap: h2, scroll: [] };
      delete rest.start;
      this.send(rest, useBeacon);
      return;
    }
    if (body.length > MAX_PAYLOAD_BYTES) return;
    try {
      if (useBeacon && typeof navigator.sendBeacon === "function") {
        const sent = navigator.sendBeacon(ENDPOINT, new Blob([body], { type: "application/json" }));
        if (sent) return;
      }
      void fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
        credentials: "same-origin",
      }).catch(() => undefined);
    } catch {
      // Analytics must never break the page.
    }
  }
}
