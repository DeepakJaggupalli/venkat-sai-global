/**
 * Portfolio video links → privacy-friendly embed URLs (client-safe, pure). Only YouTube and Vimeo
 * https links are accepted (mirrors VIDEO_URL_PATTERN in the candidates schemas); anything else
 * returns null and is shown as a plain link instead of an embed.
 */
export type VideoEmbed = { provider: "youtube" | "vimeo"; id: string; embedUrl: string };

const YOUTUBE_ID = /^[A-Za-z0-9_-]{6,20}$/;
const VIMEO_ID = /^\d{4,15}$/;

export function toVideoEmbed(raw: string | null | undefined): VideoEmbed | null {
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  const host = url.hostname.toLowerCase().replace(/^(www|m)\./, "");
  const parts = url.pathname.split("/").filter(Boolean);

  let youtubeId: string | null = null;
  if (host === "youtu.be") youtubeId = parts[0] ?? null;
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (parts[0] === "watch") youtubeId = url.searchParams.get("v");
    else if (parts[0] === "embed" || parts[0] === "shorts" || parts[0] === "live" || parts[0] === "v") youtubeId = parts[1] ?? null;
  }
  if (youtubeId !== null) {
    return YOUTUBE_ID.test(youtubeId) ? { provider: "youtube", id: youtubeId, embedUrl: `https://www.youtube-nocookie.com/embed/${youtubeId}` } : null;
  }

  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const id = host === "player.vimeo.com" ? (parts[0] === "video" ? parts[1] : null) : parts.find((p) => VIMEO_ID.test(p));
    if (id && VIMEO_ID.test(id)) return { provider: "vimeo", id, embedUrl: `https://player.vimeo.com/video/${id}?dnt=1` };
  }
  return null;
}
