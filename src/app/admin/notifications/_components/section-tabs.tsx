import { LinkTabs } from "@/components/shared/link-tabs";

export function NotificationAdminTabs({ canTemplates, canLogs }: { canTemplates: boolean; canLogs: boolean }) {
  const items = [
    ...(canTemplates ? [{ href: "/admin/notifications", label: "Templates", match: "exact" as const }] : []),
    ...(canLogs ? [{ href: "/admin/notifications/deliveries", label: "Delivery log" }] : []),
  ];
  if (items.length < 2) return null;
  return <LinkTabs label="Notification settings" items={items} />;
}
