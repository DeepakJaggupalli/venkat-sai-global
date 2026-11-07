"use client";

import { createContext, useCallback, useContext } from "react";

import { useT } from "@/i18n/client";
import { translate, type Messages } from "@/i18n/config";
import enCommon from "@/i18n/messages/en/common.json";

const EN_COMMON = enCommon as Messages;

export type ShellT = (key: string, vars?: Record<string, string | number>, fallback?: string) => string;

/**
 * Translator for shell chrome (namespace "common").
 *
 * Inside the People Portal an <I18nProvider> supplies Hindi/Telugu messages; business portals are
 * English-only and render no provider, so lookups fall back to the English catalogue (the single
 * source of truth for shell copy). `fallback` is used when even English has no such key, e.g. for
 * navigation sections added to the config before they are translated.
 *
 * Note: the returned function is not referentially stable outside an I18nProvider — never put it in
 * effect dependencies.
 */
export function useShellT(): ShellT {
  const t = useT("common");
  return useCallback<ShellT>(
    (key, vars, fallback) => {
      const value = t(key, vars);
      if (value !== key) return value;
      const english = translate(EN_COMMON, {}, key, vars, "en");
      return english !== key ? english : (fallback ?? key);
    },
    [t],
  );
}

/**
 * Language of the current shell ("en" for business portals, the reader's locale in the People Portal).
 * Radix portals (menus, popovers, tooltips, sheets) render under <body>, outside the shell's `lang`
 * wrapper, so they must set `lang={useShellLang()}` themselves — otherwise they would inherit the root
 * <html lang> taken from the language cookie.
 */
export const ShellLangContext = createContext<string | undefined>(undefined);

export function useShellLang(): string | undefined {
  return useContext(ShellLangContext);
}
