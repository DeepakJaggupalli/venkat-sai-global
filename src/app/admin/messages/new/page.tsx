import type { Metadata } from "next";

import { PortalBreadcrumb } from "@/components/layout/portal-breadcrumb";
import { NewThreadForm } from "@/components/messages/new-thread-form";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { sp, type SearchParams } from "@/lib/http";
import { requireStaff } from "@/modules/identity/authz";

import { searchPeopleAction } from "../actions";
import { organizationOptions } from "../_lib/queries";

export const metadata: Metadata = { title: "New conversation" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function NewStaffConversationPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireStaff(["orgs.view", "candidates.view"], "any");
  const params = await searchParams;
  const org = sp(params, "organization");
  const orgs = await organizationOptions();
  return (
    <div className="space-y-6">
      <PortalBreadcrumb items={[{ label: "Messages", href: "/admin/messages" }, { label: "New conversation" }]} />
      <PageHeader
        title="New conversation"
        description="Message an organisation's team, or individual people such as candidates. They are notified and can reply from their portal."
        backLink={{ href: "/admin/messages", label: "Back to messages" }}
      />
      <SectionCard title="Message" headingLevel="h2">
        <NewThreadForm portal="admin" basePath="/admin/messages" organizationOptions={orgs} searchPeople={searchPeopleAction} defaultOrganizationId={org && UUID.test(org) ? org : undefined} />
      </SectionCard>
    </div>
  );
}
