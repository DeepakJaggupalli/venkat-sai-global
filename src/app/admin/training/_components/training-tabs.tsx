import { LinkTabs } from "@/components/shared/link-tabs";

/** Section navigation for Command Centre training oversight. */
export function TrainingTabs() {
  return (
    <LinkTabs
      label="Training sections"
      items={[
        { href: "/admin/training", label: "Overview", match: "exact" },
        { href: "/admin/training/courses", label: "Courses", match: "prefix" },
        { href: "/admin/training/batches", label: "Batches", match: "prefix" },
        { href: "/admin/training/certificates", label: "Certificates", match: "prefix" },
        { href: "/admin/training/institutions", label: "Institutions", match: "prefix" },
      ]}
    />
  );
}
