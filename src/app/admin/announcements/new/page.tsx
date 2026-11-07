import type { Metadata } from "next";

import { AnnouncementForm } from "@/components/cms/announcement-form";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { requireStaff } from "@/modules/identity/authz";
import { CONTENT_ADMIN_PATHS } from "@/modules/content/links";

export const metadata: Metadata = { title: "New announcement" };

export default async function NewAnnouncementPage() {
  await requireStaff("announcements.manage");
  return (
    <div className="space-y-6">
      <PageHeader
        title="New announcement"
        description="It is saved as a draft. Publish it from the next screen."
        breadcrumbs={[{ label: "Command Centre", href: "/admin" }, { label: "Announcements", href: CONTENT_ADMIN_PATHS.announcements }, { label: "New" }]}
      />
      <SectionCard title="Announcement">
        <AnnouncementForm values={{ title: "", body: null, linkUrl: null, linkLabel: null, audience: ["public"], placements: ["homepage_banner"], priority: "normal", startsAt: null, endsAt: null, isDismissible: true }} />
      </SectionCard>
    </div>
  );
}
