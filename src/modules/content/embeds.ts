/**
 * Embed URL parsing (pure, client-safe).
 *
 * Videos: only YouTube and Vimeo are accepted, and every accepted URL is normalised to the provider's player
 * URL (YouTube → privacy-enhanced youtube-nocookie.com). The public site's CSP frame-src must allow
 * https://www.youtube-nocookie.com and https://player.vimeo.com.
 *
 * Maps: only Google Maps embed URLs and OpenStreetMap's embed page are accepted (CSP frame-src:
 * https://www.google.com, https://www.openstreetmap.org).
 */

export type VideoEmbed = {
  provider: "youtube" | "vimeo";
  videoId: string;
  /** Normalised player URL to put in an <iframe src>. */
  embedUrl: string;
  /** Canonical watch URL (for "Watch on YouTube" links and transcripts). */
  watchUrl: string;
};

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const VIMEO_ID = /^\d{6,12}$/;
const VIMEO_HASH = /^[0-9a-f]{6,20}$/i;

function parseHttpsUrl(input: string): URL | null {
  const trimmed = input.trim();
  if (!trimmed || /\s/.test(trimmed) || trimmed.length > 500) return null;
  try {
    const url = new URL(trimmed);
    return url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

function youtube(videoId: string | null | undefined): VideoEmbed | null {
  if (!videoId || !YOUTUBE_ID.test(videoId)) return null;
  return {
    provider: "youtube",
    videoId,
    embedUrl: `https://www.youtube-nocookie.com/embed/${videoId}`,
    watchUrl: `https://www.youtube.com/watch?v=${videoId}`,
  };
}

function vimeo(videoId: string | null | undefined, hash?: string | null): VideoEmbed | null {
  if (!videoId || !VIMEO_ID.test(videoId)) return null;
  const h = hash && VIMEO_HASH.test(hash) ? hash : null;
  return {
    provider: "vimeo",
    videoId,
    embedUrl: `https://player.vimeo.com/video/${videoId}${h ? `?h=${h}` : ""}`,
    watchUrl: `https://vimeo.com/${videoId}${h ? `/${h}` : ""}`,
  };
}

/**
 * Parse a YouTube or Vimeo URL (watch, share, shorts, embed or player form) into a normalised embed.
 * Returns null for anything else (other hosts, http:, playlists without a video, malformed ids).
 */
export function parseVideoEmbedUrl(input: string): VideoEmbed | null {
  const url = parseHttpsUrl(input);
  if (!url) return null;
  const host = url.hostname.toLowerCase();
  const segments = url.pathname.split("/").filter(Boolean);

  if (host === "youtu.be") return youtube(segments[0]);
  if (["youtube.com", "www.youtube.com", "m.youtube.com", "youtube-nocookie.com", "www.youtube-nocookie.com"].includes(host)) {
    if (segments[0] === "watch") return youtube(url.searchParams.get("v"));
    if (["embed", "shorts", "live", "v"].includes(segments[0] ?? "")) return youtube(segments[1]);
    return null;
  }
  if (host === "vimeo.com" || host === "www.vimeo.com") {
    // vimeo.com/<id>[/<hash>]  (also /channels/<name>/<id>, /groups/<name>/videos/<id>)
    const idIndex = segments.findIndex((s) => VIMEO_ID.test(s));
    if (idIndex < 0) return null;
    return vimeo(segments[idIndex], segments[idIndex + 1] ?? url.searchParams.get("h"));
  }
  if (host === "player.vimeo.com") {
    if (segments[0] !== "video") return null;
    return vimeo(segments[1], url.searchParams.get("h"));
  }
  return null;
}

/** True for Google Maps embed URLs and the OpenStreetMap embed page (https only). */
export function isAllowedMapEmbedUrl(input: string): boolean {
  const url = parseHttpsUrl(input);
  if (!url) return false;
  const host = url.hostname.toLowerCase();
  if ((host === "www.google.com" || host === "google.com" || host === "maps.google.com") && url.pathname.startsWith("/maps/embed")) return true;
  // Key-less place embed: https://www.google.com/maps?q=<place>&output=embed
  if ((host === "www.google.com" || host === "maps.google.com") && url.pathname === "/maps" && url.searchParams.get("output") === "embed") return true;
  if (host === "www.openstreetmap.org" && url.pathname === "/export/embed.html") return true;
  return false;
}

/** Site-relative path ("/jobs?x=1") or absolute http(s) URL. Rejects protocol-relative and script URLs. */
export function isSafeLink(input: string, opts: { allowRelative: boolean }): boolean {
  const value = input.trim();
  if (!value || /\s/.test(value) || value.length > 2048) return false;
  if (value.startsWith("/")) {
    return opts.allowRelative && !value.startsWith("//") && !value.startsWith("/\\");
  }
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && url.hostname.length > 0;
  } catch {
    return false;
  }
}
