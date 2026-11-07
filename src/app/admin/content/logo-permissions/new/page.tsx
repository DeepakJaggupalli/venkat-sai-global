import type { Metadata } from "next";

import { LogoPermissionForm } from "@/components/cms/logo-permission-form";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { requireStaff, staffCan } from "@/modules/identity/authz";
import { CONTENT_ADMIN_PATHS } from "@/modules/content/links";

export const metadata: Metadata = { title: "Record a logo permission" };

export default async function NewLogoPermissionPage() {
  const ctx = await requireStaff("content.edit");
  return (
    <div className="space-y-6">
      <PageHeader
        title="Record a logo permission"
        description="It starts as pending. A publisher checks the evidence and approves it before any logo can be shown."
        breadcrumbs={[{ label: "Content", href: CONTENT_ADMIN_PATHS.content }, { label: "Logo permissions", href: CONTENT_ADMIN_PATHS.logoPermissions }, { label: "New" }]}
      />
      <SectionCard title="Permission">
        <LogoPermissionForm
          assets={{}}
          canUpload={staffCan(ctx, "media.manage")}
          values={{
            organizationName: "",
            relationship: "client",
            logoAssetId: null,
            permissionType: "written_consent",
            evidenceFile: null,
            evidenceReference: null,
            grantedByName: null,
            grantedByDesignation: null,
            grantedAt: null,
            expiresAt: null,
            displayLocations: [],
            conditions: null,
            notes: null,
          }}
        />
      </SectionCard>
    </div>
  );
}
