import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";

import { Callout } from "@/components/shared/callout";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { getFile, getFiles } from "@/modules/files";
import { toFileSummary } from "@/modules/files/present";
import { requireOrgMember } from "@/modules/identity/authz";
import { COMPANY_SIZE_BANDS, COMPANY_SIZE_LABELS } from "@/modules/organizations/constants";
import { getCompanyProfile, listBranches } from "@/modules/organizations/employer";
import { publicEmployerPath } from "@/modules/organizations/paths";
import { getOrganizationOverview } from "@/modules/organizations/queries";
import { countryOptions, currencyOptions, industryOptions, jobCategoryOptions } from "@/modules/taxonomy/queries";

import { BranchesManager } from "./_components/branches-manager";
import { BrandingControls } from "./_components/branding-controls";
import { CompanyDetailsForm } from "./_components/company-details-form";
import { CompanyProfileForm } from "./_components/company-profile-form";

export const metadata: Metadata = { title: "Company profile" };

const IDENTITY_LOCKED_STATUSES = new Set(["pending", "under_review", "verified", "suspended"]);

export default async function EmployerCompanyPage() {
  const ctx = await requireOrgMember("employer", "employer.company.manage");
  const orgId = ctx.organization.id;
  const [overview, profile, branches, countries, industries, currencies, categories] = await Promise.all([
    getOrganizationOverview(ctx, orgId),
    getCompanyProfile(ctx, orgId),
    listBranches(ctx, orgId, { includeInactive: true }),
    countryOptions(),
    industryOptions(),
    currencyOptions(),
    jobCategoryOptions(),
  ]);
  const org = overview.organization;
  const [logoFile, coverFile, cultureFiles] = await Promise.all([
    org.logoFileId ? getFile(org.logoFileId) : null,
    profile?.coverFileId ? getFile(profile.coverFileId) : null,
    profile?.cultureMediaFileIds.length ? getFiles(profile.cultureMediaFileIds) : [],
  ]);
  const identityLocked = IDENTITY_LOCKED_STATUSES.has(org.status);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Company profile"
        description="Your company details, employer brand and branches. Verified details build trust with candidates."
        status={<StatusBadge status={org.status} domain="organization" />}
        actions={[{ label: "Verification", href: "/employer/company/verification", icon: <ShieldCheck aria-hidden="true" />, variant: "outline" }]}
      />

      {org.status === "verified" ? null : (
        <Callout tone="info" title="Verification unlocks job publishing" action={{ label: "Go to verification", href: "/employer/company/verification" }}>
          Complete your details, upload your registration certificate and submit your company for review.
        </Callout>
      )}

      <SectionCard title="Company details" description="Identity, registered address and official contact" id="details">
        <CompanyDetailsForm
          identityLocked={identityLocked}
          countries={countries}
          industries={industries}
          defaults={{
            name: org.name,
            legalName: org.legalName,
            description: org.description,
            websiteUrl: org.websiteUrl,
            email: org.email,
            phone: org.phone,
            industryId: org.industryId,
            countryCode: org.countryCode,
            stateRegion: org.stateRegion,
            city: org.city,
            addressLine1: org.addressLine1,
            addressLine2: org.addressLine2,
            postalCode: org.postalCode,
            registrationNumber: org.registrationNumber,
            taxId: org.taxId,
          }}
        />
      </SectionCard>

      <SectionCard title="Logo and public page" id="branding">
        <BrandingControls
          organizationId={orgId}
          logo={logoFile ? toFileSummary(logoFile) : null}
          isPublic={org.isPublic}
          isVerified={org.status === "verified"}
          publicUrl={publicEmployerPath(org.slug)}
        />
      </SectionCard>

      <SectionCard title="Employer profile" description="What candidates see about your company on jobs and your public page" id="profile">
        <CompanyProfileForm
          organizationId={orgId}
          cover={coverFile ? toFileSummary(coverFile) : null}
          cultureMedia={cultureFiles.map(toFileSummary)}
          countries={countries}
          currencies={currencies}
          categories={categories}
          sizeOptions={COMPANY_SIZE_BANDS.map((value) => ({ value, label: COMPANY_SIZE_LABELS[value] }))}
          defaults={{
            companySize: profile?.companySize ?? null,
            foundedYear: profile?.foundedYear ?? null,
            headquartersCountryCode: profile?.headquartersCountryCode ?? null,
            hiringRegions: profile?.hiringRegions ?? [],
            typicalRoles: profile?.typicalRoles ?? [],
            typicalJobCategoryIds: profile?.typicalJobCategoryIds ?? [],
            employerBrandingTagline: profile?.employerBrandingTagline ?? null,
            aboutHtml: profile?.aboutHtml ?? null,
            socialLinks: (profile?.socialLinks ?? {}) as Record<string, string>,
            benefitsOffered: profile?.benefitsOffered ?? [],
            publicContactEmail: profile?.publicContactEmail ?? null,
            publicContactPhone: profile?.publicContactPhone ?? null,
            isHiringOverseas: profile?.isHiringOverseas ?? false,
            defaultCurrency: profile?.defaultCurrency ?? null,
          }}
        />
      </SectionCard>

      <SectionCard title="Branches and sites" description="Offices and work sites you hire for" id="branches">
        <BranchesManager
          countries={countries}
          branches={branches.map((b) => ({
            id: b.id,
            name: b.name,
            countryCode: b.countryCode,
            stateRegion: b.stateRegion,
            city: b.city,
            addressLine1: b.addressLine1,
            addressLine2: b.addressLine2,
            postalCode: b.postalCode,
            timezone: b.timezone,
            isHeadquarters: b.isHeadquarters,
            contactName: b.contactName,
            contactEmail: b.contactEmail,
            contactPhone: b.contactPhone,
            isActive: b.isActive,
          }))}
        />
      </SectionCard>
    </div>
  );
}
