import type { MetadataRoute } from "next";

import { BRAND, DEFAULT_SEO } from "@/config/site";

/** Web app manifest (PWA basics): installable shortcut to the public site with the brand colours and mark. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: BRAND.name,
    short_name: BRAND.shortName,
    description: DEFAULT_SEO.description,
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#101C35",
    lang: "en-IN",
    categories: ["business", "education", "productivity"],
    icons: [
      { src: "/icon", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png", purpose: "any" },
    ],
  };
}
