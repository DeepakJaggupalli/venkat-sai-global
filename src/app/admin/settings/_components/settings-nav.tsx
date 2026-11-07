import { LinkTabs } from "@/components/shared/link-tabs";

/** Sub-navigation for the Command Centre settings area (every tab needs settings.view; editing is gated per page). */
const ITEMS = [
  { href: "/admin/settings", label: "General", match: "exact" as const },
  { href: "/admin/settings/modules", label: "Modules" },
  { href: "/admin/settings/roles", label: "Roles and permissions" },
  { href: "/admin/settings/taxonomies", label: "Taxonomies" },
  { href: "/admin/settings/workflows", label: "Workflows" },
  { href: "/admin/settings/security", label: "Security" },
  { href: "/admin/settings/integrations", label: "Integrations" },
];

export function SettingsNav() {
  return <LinkTabs items={ITEMS} label="Settings sections" />;
}

export const SETTINGS_CRUMB = { label: "Settings", href: "/admin/settings" };
