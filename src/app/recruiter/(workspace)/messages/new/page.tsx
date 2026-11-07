import type { Metadata } from "next";

import { PortalBreadcrumb } from "@/components/layout/portal-breadcrumb";
import { NewThreadForm } from "@/components/messages/new-thread-form";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { requireOrgMember } from "@/modules/identity/authz";

export const metadata: Metadata = { title: "New conversation" };

export default async function NewConversationPage() {
  const ctx = await requireOrgMember("recruitment_partner", "partner.messages");
  return (
    <div className="space-y-6">
      <PortalBreadcrumb items={[{ label: "Messages", href: "/recruiter/messages" }, { label: "New conversation" }]} />
      <PageHeader
        title="New conversation"
        description="Send a message to the Venkat Sai team. For a problem that needs tracking, raise a support request instead."
        backLink={{ href: "/recruiter/messages", label: "Back to messages" }}
      />
      <SectionCard title="Message" headingLevel="h2">
        <NewThreadForm portal="recruiter" basePath="/recruiter/messages" organizationId={ctx.organization.id} />
      </SectionCard>
    </div>
  );
}
