import { Languages } from "lucide-react";
import Link from "next/link";

import { PUBLIC_LOCALE_LABELS, PUBLIC_LOCALES, type PublicLocale } from "@/i18n/config";
import { cn } from "@/lib/utils";

/**
 * Small "English / हिन्दी / తెలుగు / ଓଡ଼ିଆ / العربية" switch for a translated public page. Links use `?lang=` (as on
 * /safe-recruitment), so the choice can be shared and the visitor's saved preference is not changed.
 */
export function LanguageSwitch({ path, locale, label, className }: { path: string; locale: PublicLocale; label: string; className?: string }) {
  return (
    <nav aria-label={label} className={cn("flex flex-wrap items-center gap-2 text-sm", className)} data-testid="language-switch">
      <Languages aria-hidden="true" className="size-4 text-muted-foreground" />
      {PUBLIC_LOCALES.map((code) => (
        <Link
          key={code}
          href={`${path}?lang=${code}`}
          hrefLang={code}
          lang={code}
          aria-current={code === locale ? "true" : undefined}
          className={cn(
            "inline-flex min-h-9 items-center rounded-full border px-3 font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2",
            code === locale ? "border-foreground bg-foreground text-white" : "border-border bg-white text-foreground hover:border-[#c9cdd5]",
          )}
        >
          {PUBLIC_LOCALE_LABELS[code].label}
        </Link>
      ))}
    </nav>
  );
}
