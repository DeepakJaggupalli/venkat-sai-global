import { LinkTabs } from "@/components/shared/link-tabs";

/** Section navigation for the partner workflow in the Command Centre. */
export function PartnerTabs() {
  return (
    <LinkTabs
      label="Partner sections"
      items={[
        { href: "/admin/partners", label: "Assignments", match: "exact" },
        { href: "/admin/partners/submissions", label: "Submissions", match: "prefix" },
        { href: "/admin/partners/performance", label: "Performance", match: "prefix" },
        { href: "/admin/partners/agreements", label: "Agreements", match: "prefix" },
      ]}
    />
  );
}
