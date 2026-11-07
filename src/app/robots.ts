import type { MetadataRoute } from "next";

import { absoluteUrl } from "@/lib/env";

/**
 * Crawl rules: the public website is indexable; portals, account pages, the API and CMS preview links are not.
 * (Preview pages are also served with `noindex`.)
 */
export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/talent", "/employer$", "/employer?", "/employer/", "/recruiter", "/institution$", "/institution?", "/institution/", "/admin", "/account", "/api/", "/billing", "/notifications", "/dev", "/preview", "/*?preview=", "/*&preview="],
      },
    ],
    sitemap: absoluteUrl("/sitemap.xml"),
    host: absoluteUrl("/"),
  };
}
