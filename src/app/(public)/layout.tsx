import type { ReactNode } from "react";

import { PublicFooter } from "@/components/layout/public-footer";
import { PublicHeader } from "@/components/layout/public-header";
import { getHeaderAccount } from "@/components/layout/shell-data";
import { resolveContact } from "@/components/public/contact-links";
import { getNavigation, getSiteSettings, getTickerAnnouncement, legalEntityName, toFooterColumns, toLegalLinks, toNavItems, toSocialLinks } from "@/components/public/site-data";
import { WhatsAppFloat } from "@/components/public/whatsapp-float";

/**
 * Public website layout: header, `<main id="main-content">`, footer and the floating WhatsApp button.
 *
 * Header and footer content comes from the CMS singletons (navigation, site settings) and the active public
 * "ticker" announcement; every source falls back to the built-in defaults (PUBLIC_NAV, standard legal
 * links, the business contact details in src/config/contact.ts) when it is missing or fails to load. Homepage banner
 * announcements are rendered by the homepage itself.
 * Public pages are English for now, hence `lang="en"` regardless of the People Portal language cookie.
 */
export default async function PublicLayout({ children }: { children: ReactNode }) {
  const [account, settings, navigation, announcement] = await Promise.all([getHeaderAccount(), getSiteSettings(), getNavigation(), getTickerAnnouncement()]);
  const contact = resolveContact(settings?.contact);
  return (
    <div lang="en" className="flex min-h-dvh flex-col bg-background">
      <PublicHeader account={account} navItems={toNavItems(navigation)} announcement={announcement} />
      <main id="main-content" tabIndex={-1} className="flex-1 focus:outline-none">
        {children}
      </main>
      <PublicFooter
        columns={toFooterColumns(navigation)}
        contact={contact}
        social={toSocialLinks(settings)}
        legalEntity={legalEntityName(settings)}
        legalLinks={toLegalLinks(navigation)}
      />
      <WhatsAppFloat e164={contact.whatsapp.e164} />
    </div>
  );
}
