import type { Metadata, Viewport } from "next";
import { Figtree, Inter } from "next/font/google";

import { AnalyticsTracker } from "@/components/analytics/analytics-tracker";
import { ConsentBanner } from "@/components/privacy/consent-banner";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BRAND, DEFAULT_SEO } from "@/config/site";
import { getLocale } from "@/i18n/server";

import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" });
/** Geometric sans for headings (`font-heading`, 600-700) and the heavy public display headlines (`font-display`, 800). */
const figtree = Figtree({ variable: "--font-figtree", subsets: ["latin"], display: "swap", weight: ["500", "600", "700", "800"] });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3000"),
  title: { default: DEFAULT_SEO.title, template: `%s | ${BRAND.name}` },
  description: DEFAULT_SEO.description,
  applicationName: BRAND.name,
  openGraph: { type: "website", siteName: BRAND.name, title: DEFAULT_SEO.title, description: DEFAULT_SEO.description },
  twitter: { card: "summary_large_image" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#FFFFFF",
  width: "device-width",
  initialScale: 1,
};

/**
 * Root layout. Reading the locale cookie makes every route dynamic (intended: content comes
 * from the database per request). Each section layout renders its own <main id="main-content">.
 */
export default async function RootLayout({ children }: LayoutProps<"/">) {
  const locale = await getLocale();
  return (
    <html lang={locale} className={`${inter.variable} ${figtree.variable}`} suppressHydrationWarning>
      <body className="min-h-dvh bg-background font-sans text-foreground antialiased">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
        >
          Skip to main content
        </a>
        <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
        <Toaster richColors closeButton position="top-right" />
        <ConsentBanner />
        <AnalyticsTracker />
      </body>
    </html>
  );
}
