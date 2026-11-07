import type { PlatformPermission } from "@/config/permissions";

export const ADMIN_COMMERCIAL = "/admin/commercial";

export const commercialNav: { href: string; label: string; match: "exact" | "prefix"; permission: PlatformPermission }[] = [
  { href: ADMIN_COMMERCIAL, label: "Overview", match: "exact", permission: "commercial.view" },
  { href: `${ADMIN_COMMERCIAL}/plans`, label: "Plans", match: "prefix", permission: "commercial.view" },
  { href: `${ADMIN_COMMERCIAL}/subscriptions`, label: "Subscriptions", match: "prefix", permission: "commercial.view" },
  { href: `${ADMIN_COMMERCIAL}/invoices`, label: "Invoices", match: "prefix", permission: "commercial.view" },
  { href: `${ADMIN_COMMERCIAL}/payments`, label: "Payments", match: "prefix", permission: "commercial.view" },
  { href: `${ADMIN_COMMERCIAL}/refunds`, label: "Refunds", match: "prefix", permission: "commercial.view" },
  { href: `${ADMIN_COMMERCIAL}/disputes`, label: "Disputes", match: "prefix", permission: "commercial.view" },
  { href: `${ADMIN_COMMERCIAL}/coupons`, label: "Coupons", match: "prefix", permission: "commercial.view" },
  { href: `${ADMIN_COMMERCIAL}/tax-rates`, label: "Tax rates", match: "prefix", permission: "commercial.view" },
  { href: `${ADMIN_COMMERCIAL}/seller`, label: "Seller details", match: "prefix", permission: "commercial.view" },
  { href: `${ADMIN_COMMERCIAL}/settlements`, label: "Partner settlements", match: "prefix", permission: "partners.settlements" },
];

/** Breadcrumb root for Command Centre commercial pages. */
export const COMMERCIAL_CRUMB = { label: "Revenue & billing", href: ADMIN_COMMERCIAL };
