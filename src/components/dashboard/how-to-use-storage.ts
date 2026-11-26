/**
 * "How to use" card visibility, remembered per portal in localStorage (client-safe, pure — the storage is
 * passed in so tests can use a fake). Every access is wrapped: private windows, blocked site data and
 * storage quotas just mean the choice is not remembered; the card then shows expanded, as for a first visit.
 */

export type HowToUseState = "shown" | "hidden";

export const HOW_TO_USE_STORAGE_PREFIX = "vsg:how-to-use:";

type StorageLike = Pick<Storage, "getItem" | "setItem">;

export function howToUseStorageKey(portal: string): string {
  return `${HOW_TO_USE_STORAGE_PREFIX}${portal}`;
}

/** The remembered state, or "shown" (first visit, unknown value or unavailable storage). */
export function readHowToUseState(storage: StorageLike | null | undefined, portal: string): HowToUseState {
  try {
    return storage?.getItem(howToUseStorageKey(portal)) === "hidden" ? "hidden" : "shown";
  } catch {
    return "shown";
  }
}

/** Remember the choice; returns false when the browser would not store it. */
export function writeHowToUseState(storage: StorageLike | null | undefined, portal: string, state: HowToUseState): boolean {
  try {
    if (!storage) return false;
    storage.setItem(howToUseStorageKey(portal), state);
    return true;
  } catch {
    return false;
  }
}

/** window.localStorage, or null where reading it throws (sandboxed frames, blocked cookies). */
export function browserStorage(): StorageLike | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}
