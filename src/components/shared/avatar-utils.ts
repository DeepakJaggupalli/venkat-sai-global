import type { Tone } from "./tones";

/**
 * Deterministic fallback colour for initials avatars (client-safe, unit-tested): the same name always
 * gets the same soft tone, so people are recognisable across lists without relying on colour.
 */
const AVATAR_TONES: Tone[] = ["brand", "info", "gold", "neutral", "success"];

export function avatarTone(seed: string | null | undefined): Tone {
  const text = (seed ?? "").trim().toLowerCase();
  if (!text) return "neutral";
  let hash = 0;
  for (let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) | 0;
  return AVATAR_TONES[Math.abs(hash) % AVATAR_TONES.length] ?? "neutral";
}

/** Initials for organisations: first letters of the first two significant words ("Example Co." → "EC"). */
export function orgInitials(name: string | null | undefined): string {
  if (!name) return "?";
  const stop = new Set(["the", "and", "of", "&", "pvt", "ltd", "llc", "inc", "private", "limited"]);
  // Strip ASCII punctuation only, so non-Latin names (Hindi, Telugu, Arabic…) keep their letters.
  const words = name
    .replace(/[!-%'-/:-@[-`{-~]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !stop.has(w.toLowerCase()));
  const picked = words.length > 0 ? words : name.split(/\s+/).filter(Boolean);
  const letters = picked
    .slice(0, 2)
    .map((w) => Array.from(w)[0] ?? "")
    .join("");
  return letters.toUpperCase() || "?";
}
