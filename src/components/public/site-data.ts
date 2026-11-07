import "server-only";

import { cache } from "react";

import type { FooterColumn, FooterContact, FooterLink, PublicNavItem, SocialLink, SocialPlatform } from "@/components/layout/types";
import { BRAND } from "@/config/site";
import type { NavigationData, SiteSettingsData } from "@/modules/content/collections";
import { getActiveAnnouncements, getSingletonData, toBannerAnnouncement } from "@/modules/content/queries";

import { settle } from "./server";

/**
 * Site-wide CMS data for the public layout (site settings, navigation, announcements), deduplicated per
 * request with React `cache()` so pages can read the same settings without a second query.
 * Every loader falls back to built-in defaults (undefined → the header/footer use PUBLIC_NAV etc.).
 */

export const getSiteSettings = cache(async (): Promise<SiteSettingsData | null> => settle("site_settings", () => getSingletonData("site_settings"), null));

export const getNavigation = cache(async (): Promise<NavigationData | null> => settle("navigation", () => getSingletonData("navigation"), null));

const SOCIAL_PLATFORMS: readonly SocialPlatform[] = ["linkedin", "facebook", "instagram", "youtube", "x", "whatsapp", "telegram", "other"];

type Link = { title?: string | null; href?: string | null; description?: string | null };

function link(l: Link | null | undefined): FooterLink | null {
  const title = l?.title?.trim();
  const href = l?.href?.trim();
  return title && href ? { title, href } : null;
}

export function toNavItems(nav: NavigationData | null): PublicNavItem[] | undefined {
  const items = (nav?.headerItems ?? [])
    .map((item): PublicNavItem | null => {
      const base = link(item);
      if (!base) return null;
      const children = (item.children ?? []).map((c) => {
        const child = link(c);
        return child ? { ...child, ...(c.description?.trim() ? { description: c.description.trim() } : {}) } : null;
      });
      const kids = children.filter((c): c is NonNullable<typeof c> => c !== null);
      return { ...base, ...(item.description?.trim() ? { description: item.description.trim() } : {}), ...(kids.length ? { children: kids } : {}) };
    })
    .filter((i): i is PublicNavItem => i !== null);
  return items.length ? items : undefined;
}

export function toFooterColumns(nav: NavigationData | null): FooterColumn[] | undefined {
  const columns = (nav?.footerColumns ?? [])
    .map((col): FooterColumn | null => {
      const title = col.title?.trim();
      const links = (col.links ?? []).map(link).filter((l): l is FooterLink => l !== null);
      return title && links.length ? { title, links } : null;
    })
    .filter((c): c is FooterColumn => c !== null);
  return columns.length ? columns : undefined;
}

export function toLegalLinks(nav: NavigationData | null): FooterLink[] | undefined {
  const links = (nav?.legalLinks ?? []).map(link).filter((l): l is FooterLink => l !== null);
  return links.length ? links : undefined;
}

export function toFooterContact(settings: SiteSettingsData | null): FooterContact | null {
  const c = settings?.contact;
  if (!c) return null;
  const contact: FooterContact = {
    address: c.address?.trim() || null,
    email: c.email?.trim() || null,
    phone: c.phone?.trim() || null,
    whatsapp: c.whatsappNumber?.trim() || null,
    hours: c.businessHours?.trim() || null,
  };
  return Object.values(contact).some(Boolean) ? contact : null;
}

export function toSocialLinks(settings: SiteSettingsData | null): SocialLink[] | undefined {
  const links = (settings?.socialLinks ?? [])
    .map((s): SocialLink | null => {
      const platform = SOCIAL_PLATFORMS.find((p) => p === s.platform);
      const href = s.url?.trim();
      if (!platform || !href) return null;
      return { platform, href, ...(s.label?.trim() ? { label: s.label.trim() } : {}) };
    })
    .filter((s): s is SocialLink => s !== null);
  return links.length ? links : undefined;
}

export function legalEntityName(settings: SiteSettingsData | null): string {
  return settings?.legalEntity?.name?.trim() || BRAND.legalEntity;
}

/** The ticker announcement shown in the header bar on every public page (highest priority first). */
export async function getTickerAnnouncement() {
  const [first] = await settle("announcements.ticker", () => getActiveAnnouncements({ audience: "public", placement: "ticker", limit: 1 }), []);
  return first ? toBannerAnnouncement(first) : null;
}

/** Homepage banner announcements (rendered by the homepage itself, not by the layout). */
export async function getHomepageBanners() {
  return settle("announcements.homepage_banner", () => getActiveAnnouncements({ audience: "public", placement: "homepage_banner", limit: 3 }), []);
}
