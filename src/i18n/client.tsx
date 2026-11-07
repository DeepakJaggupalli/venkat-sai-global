"use client";

import { createContext, useCallback, useContext, type ReactNode } from "react";

import { DEFAULT_LOCALE, translate, type Locale, type Messages, type Namespace } from "./config";

type I18nValue = { locale: Locale; messages: Partial<Record<Namespace, Messages>> };

const I18nContext = createContext<I18nValue>({ locale: DEFAULT_LOCALE, messages: {} });

/** Wrap client subtrees that need translations (messages from getClientMessages() on the server). */
export function I18nProvider({ locale, messages, children }: I18nValue & { children: ReactNode }) {
  return <I18nContext.Provider value={{ locale, messages }}>{children}</I18nContext.Provider>;
}

export function useLocale(): Locale {
  return useContext(I18nContext).locale;
}

/** Client translator: const t = useT("talent-jobs"); t("apply") */
export function useT(namespace: Namespace) {
  const { locale, messages } = useContext(I18nContext);
  const ns = messages[namespace] ?? {};
  return useCallback((key: string, vars?: Record<string, string | number>) => translate(ns, {}, key, vars, locale), [ns, locale]);
}
