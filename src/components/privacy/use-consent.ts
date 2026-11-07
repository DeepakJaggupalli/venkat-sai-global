"use client";

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";

import {
  ALL_OPTIONAL_CONSENT,
  consentNeedsPrompt,
  effectiveConsent,
  NO_OPTIONAL_CONSENT,
  type ConsentCategories,
  type ConsentMethod,
  type ConsentSource,
  type StoredConsent,
} from "@/modules/analytics/consent";

import {
  configureConsentVersion,
  getConfiguredConsentVersion,
  hasGpcSignal,
  openCookiePreferences,
  readStoredConsent,
  saveConsent,
  subscribeConsent,
  type SaveConsentResult,
} from "./consent-store";

export type UseConsentResult = {
  /** False during server rendering and hydration; values are only reliable once true. */
  ready: boolean;
  /** Current consent version (null until configured by the banner / tracker / form). */
  version: string | null;
  /** The stored choice, if any (may be for an older version). */
  stored: StoredConsent | null;
  /** What the visitor agrees to right now (outdated choice or GPC → off). */
  categories: ConsentCategories;
  /** A choice for the current version is missing. */
  needsPrompt: boolean;
  /** The browser sends a Global Privacy Control signal. */
  gpc: boolean;
  save: (categories: ConsentCategories, opts?: { method?: ConsentMethod; source?: ConsentSource; locale?: string }) => SaveConsentResult;
  acceptAll: (opts?: { source?: ConsentSource; locale?: string }) => SaveConsentResult;
  rejectAll: (opts?: { source?: ConsentSource; locale?: string }) => SaveConsentResult;
  /** Open the preferences dialog of the site-wide consent banner. */
  openPreferences: () => void;
};

const noopSubscribe = () => () => undefined;

/**
 * Consent state for client components:
 *
 *   const { ready, categories } = useConsent();
 *   if (ready && categories.analytics) { … }
 *
 * Pass `version` when you have it from the server (it is registered for the other consumers).
 */
export function useConsent(version?: string): UseConsentResult {
  useEffect(() => {
    if (version) configureConsentVersion(version);
  }, [version]);

  const ready = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const stored = useSyncExternalStore(subscribeConsent, readStoredConsent, () => null);
  const configured = useSyncExternalStore(subscribeConsent, getConfiguredConsentVersion, () => null);
  const gpc = useSyncExternalStore(noopSubscribe, hasGpcSignal, () => false);
  const currentVersion = version ?? configured;

  const categories = useMemo(
    () => (ready && currentVersion ? effectiveConsent(stored, currentVersion, gpc) : { ...NO_OPTIONAL_CONSENT }),
    [ready, currentVersion, stored, gpc],
  );
  const needsPrompt = ready && currentVersion !== null && consentNeedsPrompt(stored, currentVersion);

  const save = useCallback<UseConsentResult["save"]>(
    (choice, opts) => saveConsent(choice, { ...opts, version: currentVersion ?? undefined }),
    [currentVersion],
  );
  const acceptAll = useCallback<UseConsentResult["acceptAll"]>(
    (opts) => saveConsent({ ...ALL_OPTIONAL_CONSENT }, { method: "accept_all", ...opts, version: currentVersion ?? undefined }),
    [currentVersion],
  );
  const rejectAll = useCallback<UseConsentResult["rejectAll"]>(
    (opts) => saveConsent({ ...NO_OPTIONAL_CONSENT }, { ...opts, version: currentVersion ?? undefined }),
    [currentVersion],
  );

  return { ready, version: currentVersion, stored, categories, needsPrompt, gpc, save, acceptAll, rejectAll, openPreferences: openCookiePreferences };
}
