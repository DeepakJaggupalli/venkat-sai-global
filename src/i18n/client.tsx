"use client";

import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";

import { DEFAULT_LOCALE, translate, type Locale, type Messages, type Namespace } from "./config";

type I18nValue = { locale: Locale; messages: Partial<Record<Namespace, Messages>> };

const EMPTY_MESSAGES: Messages = Object.freeze({}) as Messages;

const I18nContext = createContext<I18nValue>({ locale: DEFAULT_LOCALE, messages: {} });

/** Wrap client subtrees that need translations (messages from getClientMessages() on the server). */
export function I18nProvider({ locale, messages, children }: I18nValue & { children: ReactNode }) {
  const value = useMemo(() => ({ locale, messages }), [locale, messages]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useLocale(): Locale {
  return useContext(I18nContext).locale;
}

/**
 * Client translator: const t = useT("talent-jobs"); t("apply").
 * The returned function is stable while the locale and messages are unchanged (safe in effect deps).
 * Outside an I18nProvider it returns keys unchanged.
 */
export function useT(namespace: Namespace) {
  const { locale, messages } = useContext(I18nContext);
  const ns = messages[namespace] ?? EMPTY_MESSAGES;
  return useCallback((key: string, vars?: Record<string, string | number>) => translate(ns, EMPTY_MESSAGES, key, vars, locale), [ns, locale]);
}
