import type { ReactNode } from "react";

import { PublicFooter } from "@/components/layout/public-footer";
import { PublicHeader } from "@/components/layout/public-header";
import { getHeaderAccount } from "@/components/layout/shell-data";

/**
 * Public website layout: header, `<main id="main-content">` and footer.
 *
 * Header/footer content (navigation, announcement, footer columns, contact, social links) will come
 * from the CMS site settings; until the content module supplies them both components render their
 * built-in defaults (PUBLIC_NAV, legal links, brand promise) and show no contact details.
 * Public pages are English for now, hence `lang="en"` regardless of the People Portal language cookie.
 */
export default async function PublicLayout({ children }: { children: ReactNode }) {
  const account = await getHeaderAccount();
  return (
    <div lang="en" className="flex min-h-dvh flex-col bg-background">
      <PublicHeader account={account} />
      <main id="main-content" tabIndex={-1} className="flex-1 focus:outline-none">
        {children}
      </main>
      <PublicFooter />
    </div>
  );
}
