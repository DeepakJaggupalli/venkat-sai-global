import type { Metadata } from "next";

import { PortalBreadcrumb } from "@/components/layout/portal-breadcrumb";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { requireStaff } from "@/modules/identity/authz";
import { GRIEVANCE_TYPE_LABELS, TICKET_CATEGORY_LABELS, TICKET_CHANNEL_LABELS, TICKET_PRIORITY_LABELS } from "@/modules/operations/constants";

import { StaffTicketForm } from "../_components/staff-ticket-form";

export const metadata: Metadata = { title: "Log a support request" };

const opts = (labels: Record<string, string>, exclude: string[] = []) => Object.entries(labels).filter(([v]) => !exclude.includes(v)).map(([value, label]) => ({ value, label }));

export default async function NewStaffTicketPage() {
  await requireStaff("support.manage");
  return (
    <div className="space-y-6">
      <PortalBreadcrumb items={[{ label: "Support desk", href: "/admin/support" }, { label: "Log a request" }]} />
      <PageHeader title="Log a support request" description="Record a request received by phone, email, WhatsApp or in person so it follows the same deadlines." backLink={{ href: "/admin/support", label: "Back to support desk" }} />
      <SectionCard title="Request" headingLevel="h2">
        <StaffTicketForm
          channels={opts(TICKET_CHANNEL_LABELS, ["web", "staff"])}
          categories={opts(TICKET_CATEGORY_LABELS)}
          priorities={opts(TICKET_PRIORITY_LABELS)}
          grievanceTypes={opts(GRIEVANCE_TYPE_LABELS)}
        />
      </SectionCard>
    </div>
  );
}
