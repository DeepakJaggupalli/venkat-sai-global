import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { LanguageSwitcher } from "@/components/i18n/language-switcher";
import { I18nProvider } from "@/i18n/client";
import { getClientMessages, getT } from "@/i18n/server";

import { BrandPanel, Wordmark } from "./_components/brand";

/**
 * Split layout for every auth screen: brand panel (large screens) + form panel with a language
 * switcher and a link home. Client components below read the "auth" namespace via useT().
 */
export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const [{ locale, messages }, t] = await Promise.all([getClientMessages(["auth", "common"]), getT("auth")]);

  return (
    <I18nProvider locale={locale} messages={messages}>
      <div className="grid min-h-dvh lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <BrandPanel t={t} />
        <div className="flex min-w-0 flex-col bg-background">
          <header className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-10">
            <Link href="/" className="rounded-md lg:hidden">
              <Wordmark />
              <span className="sr-only">{t("layout.home")}</span>
            </Link>
            <Link
              href="/"
              className="hidden items-center gap-1.5 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground lg:inline-flex"
            >
              <ArrowLeft className="size-4" aria-hidden />
              {t("layout.backHome")}
            </Link>
            <LanguageSwitcher locale={locale} />
          </header>

          <main id="main-content" tabIndex={-1} className="flex flex-1 justify-center px-4 pt-4 pb-10 outline-none sm:px-6 sm:pt-8 lg:items-center lg:px-10">
            <div className="w-full max-w-md">{children}</div>
          </main>

          <footer className="flex flex-wrap gap-x-4 gap-y-1 px-4 pb-6 text-xs text-muted-foreground sm:px-6 lg:px-10">
            <Link href="/legal/terms" className="underline-offset-4 hover:text-foreground hover:underline">
              {t("layout.terms")}
            </Link>
            <Link href="/legal/privacy-policy" className="underline-offset-4 hover:text-foreground hover:underline">
              {t("layout.privacy")}
            </Link>
          </footer>
        </div>
      </div>
    </I18nProvider>
  );
}
