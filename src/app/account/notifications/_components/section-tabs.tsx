import { LinkTabs } from "@/components/shared/link-tabs";

export const NOTIFICATIONS_PATH = "/account/notifications";
export const PREFERENCES_PATH = "/account/notifications/preferences";

/** Inbox / Preferences sub-navigation of the account notification area. */
export function NotificationSectionTabs({ active }: { active: "inbox" | "preferences" }) {
  return (
    <LinkTabs
      label="Notification sections"
      activeHref={active === "inbox" ? NOTIFICATIONS_PATH : PREFERENCES_PATH}
      items={[
        { href: NOTIFICATIONS_PATH, label: "Inbox" },
        { href: PREFERENCES_PATH, label: "Preferences" },
      ]}
    />
  );
}
