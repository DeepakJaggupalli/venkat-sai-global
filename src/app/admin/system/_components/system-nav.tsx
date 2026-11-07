import { LinkTabs } from "@/components/shared/link-tabs";

export function SystemNav({ showOutbox }: { showOutbox: boolean }) {
  return (
    <LinkTabs
      label="System sections"
      items={[
        { href: "/admin/system", label: "Health", match: "exact" },
        { href: "/admin/system/tasks", label: "Task queue" },
        ...(showOutbox ? [{ href: "/admin/system/dev-outbox", label: "Development outbox" }] : []),
      ]}
    />
  );
}
