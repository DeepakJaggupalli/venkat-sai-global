import "server-only";

import type { ReactNode } from "react";

import { I18nProvider } from "@/i18n/client";
import { getClientMessages } from "@/i18n/server";

/**
 * Translations for training pages on the public site, which candidates also use. The public layout has
 * no I18nProvider and marks its content `lang="en"`, so this wrapper supplies the `common` and
 * `talent-training` catalogues to client components and sets the language of the wrapped content.
 */
export async function TrainingI18n({ children, className }: { children: ReactNode; className?: string }) {
  const { locale, messages } = await getClientMessages(["common", "talent-training"]);
  return (
    <I18nProvider locale={locale} messages={messages}>
      <div lang={locale} className={className}>
        {children}
      </div>
    </I18nProvider>
  );
}
