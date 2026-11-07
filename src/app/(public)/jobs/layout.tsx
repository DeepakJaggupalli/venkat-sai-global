import type { ReactNode } from "react";

import { I18nProvider } from "@/i18n/client";
import { getClientMessages } from "@/i18n/server";

/**
 * The public job board is used by candidates, so it follows their language choice (en / hi / te) like
 * the People Portal: client components (save, share, filters) read the `talent-jobs` catalogue.
 */
export default async function PublicJobsLayout({ children }: { children: ReactNode }) {
  const { locale, messages } = await getClientMessages(["common", "talent-jobs"]);
  return (
    <I18nProvider locale={locale} messages={messages}>
      <div lang={locale}>{children}</div>
    </I18nProvider>
  );
}
