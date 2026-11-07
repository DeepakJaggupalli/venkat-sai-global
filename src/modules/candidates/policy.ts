/**
 * Who may see what of a candidate profile (pure, client-safe — no I/O).
 *
 * viewer.ts gathers the facts (privacy settings, visibility, applications, unlocks, attributions,
 * permissions) and asks `resolveCandidateAccess()` for the decision; search.ts mirrors the
 * `discoverable` rule in SQL. Keeping the rules here makes them unit-testable for every viewer.
 *
 * Summary:
 *  - self: everything.
 *  - staff: needs candidates.view; contact on reveal with candidates.view_contact (logged);
 *    documents, resume and identity details with candidates.view_documents; gender with
 *    candidates.manage; hidden profiles are not discoverable in sourcing searches.
 *  - employer: never when the organisation is blocked, suspended or rejected. Discoverable when the
 *    candidate is open to work and visibility is public_to_employers, or verified_employers and the
 *    organisation is verified (needs employer.candidates.search). A relationship — an application
 *    shared with the employer (consent given) or an active profile unlock — makes the profile
 *    viewable regardless of visibility (employer.pipeline.view / candidates.search / candidates.unlock).
 *    Contact details only with a relationship (or when the candidate turned off
 *    "contact only after unlock"); documents only the ones marked shareable, and only with a relationship.
 *  - partner: only candidates the partner sourced (active attribution or sourcedByPartnerOrgId);
 *    documents limited to the ones the partner uploaded.
 *  - organisations never see a minor without a granted guardian consent (DPDP Rules 2025).
 */
import type { OrgStatus } from "@/db/schema/_constants";
import type { CandidateVisibility } from "@/db/schema/candidates";

export type ViewerKind = "self" | "staff" | "employer" | "partner";

export type PrivacyFlags = {
  showFullNameToEmployers: boolean;
  showContactToUnlockedOnly: boolean;
  showPhoto: boolean;
  showCurrentEmployer: boolean;
  allowDirectContact: boolean;
  blockedOrganizationIds: readonly string[];
  allowPartnerSubmissions: boolean;
};

/** Protective defaults, used when a privacy row is missing (mirrors the column defaults). */
export const DEFAULT_PRIVACY_FLAGS: PrivacyFlags = {
  showFullNameToEmployers: false,
  showContactToUnlockedOnly: true,
  showPhoto: false,
  showCurrentEmployer: false,
  allowDirectContact: false,
  blockedOrganizationIds: [],
  allowPartnerSubmissions: false,
};

export type CandidateState = {
  visibility: CandidateVisibility;
  isOpenToWork: boolean;
  /** Profile soft-deleted / anonymised. */
  deleted: boolean;
  /** users.status = active. */
  accountActive: boolean;
  privacy: PrivacyFlags;
  /**
   * A child (under 18) without a granted guardian consent: nothing beyond age confirmation may be
   * processed (DPDP Rules 2025, rule 10), so organisations never see the profile.
   */
  restrictedMinor?: boolean;
};

export type ViewerFacts =
  | { kind: "self" }
  | { kind: "staff"; permissions: ReadonlySet<string> }
  | {
      kind: "employer";
      organizationId: string;
      organizationStatus: OrgStatus;
      permissions: ReadonlySet<string>;
      /** The candidate applied to one of this organisation's jobs, consented to sharing, and the application was shared. */
      hasApplicationShare: boolean;
      /** Active (not revoked, not expired) profile unlock of this organisation. */
      activeUnlock: { expiresAt: Date | null } | null;
    }
  | {
      kind: "partner";
      organizationId: string;
      organizationStatus: OrgStatus;
      permissions: ReadonlySet<string>;
      /** Active candidate_attributions row for this partner, or candidate_profiles.sourcedByPartnerOrgId. */
      isSourcingPartner: boolean;
    };

export type AccessDenial = "deleted" | "blocked" | "not_discoverable" | "not_sourced" | "permission_required" | "organization_inactive" | "minor_restricted";

/** full = shown; on_reveal = masked until the viewer explicitly reveals it (logged); none = never. */
export type ContactAccess = "full" | "on_reveal" | "none";

/** all = every document; shareable = the ones the candidate marked shareable; viewer_uploads = files the viewer's organisation uploaded. */
export type DocumentScope = "all" | "shareable" | "viewer_uploads" | "none";

export type CandidateAccess = {
  canView: boolean;
  denial: AccessDenial | null;
  /** Appears in this viewer's discovery search. */
  discoverable: boolean;
  relationship: { applied: boolean; unlocked: boolean; sourced: boolean };
  fullName: boolean;
  photo: boolean;
  contact: ContactAccess;
  contactHiddenReason: "unlock_or_application_required" | "permission_required" | null;
  documents: DocumentScope;
  resume: boolean;
  currentEmployer: boolean;
  /** Experience reference contacts. */
  references: boolean;
  /** Legal name, date of birth, nationality, passport details, emigration category. */
  identity: boolean;
  gender: boolean;
  expectedSalary: boolean;
  /** Staff-only operational fields (source, partner attribution, creator, internal timestamps). */
  internal: boolean;
  portfolio: "all" | "public";
  /** The viewer may message the candidate. */
  directContact: boolean;
};

const NONE: Omit<CandidateAccess, "denial"> = {
  canView: false,
  discoverable: false,
  relationship: { applied: false, unlocked: false, sourced: false },
  fullName: false,
  photo: false,
  contact: "none",
  contactHiddenReason: null,
  documents: "none",
  resume: false,
  currentEmployer: false,
  references: false,
  identity: false,
  gender: false,
  expectedSalary: false,
  internal: false,
  portfolio: "public",
  directContact: false,
};

const deny = (denial: AccessDenial, extra: Partial<CandidateAccess> = {}): CandidateAccess => ({ ...NONE, ...extra, denial });

/** Organisation states that lose every candidate access. */
export const INACTIVE_ORG_STATUSES: readonly OrgStatus[] = ["suspended", "rejected"];

/** Is the profile discoverable by an employer organisation in this state? (mirrored in search.ts SQL) */
export function isDiscoverableByEmployer(state: Pick<CandidateState, "visibility" | "isOpenToWork">, organizationStatus: OrgStatus): boolean {
  if (INACTIVE_ORG_STATUSES.includes(organizationStatus) || !state.isOpenToWork) return false;
  if (state.visibility === "public_to_employers") return true;
  return state.visibility === "verified_employers" && organizationStatus === "verified";
}

export function resolveCandidateAccess(state: CandidateState, viewer: ViewerFacts): CandidateAccess {
  switch (viewer.kind) {
    case "self":
      if (state.deleted) return deny("deleted");
      return {
        canView: true,
        denial: null,
        discoverable: false,
        relationship: { applied: false, unlocked: false, sourced: false },
        fullName: true,
        photo: true,
        contact: "full",
        contactHiddenReason: null,
        documents: "all",
        resume: true,
        currentEmployer: true,
        references: true,
        identity: true,
        gender: true,
        expectedSalary: true,
        internal: false,
        portfolio: "all",
        directContact: false,
      };

    case "staff": {
      const can = (p: string) => viewer.permissions.has(p);
      if (!can("candidates.view")) return deny("permission_required");
      if (state.deleted && !can("candidates.manage")) return deny("deleted");
      const viewContact = can("candidates.view_contact");
      const viewDocuments = can("candidates.view_documents");
      return {
        canView: true,
        denial: null,
        discoverable: state.visibility !== "hidden" && !state.deleted,
        relationship: { applied: false, unlocked: false, sourced: false },
        fullName: true,
        photo: true,
        contact: viewContact ? "on_reveal" : "none",
        contactHiddenReason: viewContact ? null : "permission_required",
        documents: viewDocuments ? "all" : "none",
        resume: viewDocuments,
        currentEmployer: true,
        references: viewContact,
        identity: viewDocuments,
        gender: can("candidates.manage"),
        expectedSalary: true,
        internal: true,
        portfolio: "all",
        directContact: true,
      };
    }

    case "employer": {
      if (INACTIVE_ORG_STATUSES.includes(viewer.organizationStatus)) return deny("organization_inactive");
      if (state.deleted || !state.accountActive) return deny("deleted");
      if (state.privacy.blockedOrganizationIds.includes(viewer.organizationId)) return deny("blocked");
      if (state.restrictedMinor) return deny("minor_restricted");
      const can = (p: string) => viewer.permissions.has(p);
      const applied = viewer.hasApplicationShare;
      const unlocked = viewer.activeUnlock !== null;
      const related = applied || unlocked;
      const discoverable = isDiscoverableByEmployer(state, viewer.organizationStatus);
      const relationshipPermission = can("employer.pipeline.view") || can("employer.candidates.search") || can("employer.candidates.unlock");
      const canView = (related && relationshipPermission) || (discoverable && can("employer.candidates.search"));
      const relationship = { applied, unlocked, sourced: false };
      if (!canView) return deny(related || discoverable ? "permission_required" : "not_discoverable", { relationship });
      const contactEntitled = related || (discoverable && !state.privacy.showContactToUnlockedOnly);
      return {
        canView: true,
        denial: null,
        discoverable,
        relationship,
        fullName: state.privacy.showFullNameToEmployers || related,
        photo: state.privacy.showPhoto,
        contact: contactEntitled ? "on_reveal" : "none",
        contactHiddenReason: contactEntitled ? null : "unlock_or_application_required",
        documents: related ? "shareable" : "none",
        resume: related,
        currentEmployer: state.privacy.showCurrentEmployer,
        references: false,
        identity: false,
        gender: false,
        expectedSalary: true,
        internal: false,
        portfolio: "public",
        directContact: related || state.privacy.allowDirectContact,
      };
    }

    case "partner": {
      if (INACTIVE_ORG_STATUSES.includes(viewer.organizationStatus)) return deny("organization_inactive");
      if (state.deleted || !state.accountActive) return deny("deleted");
      if (state.privacy.blockedOrganizationIds.includes(viewer.organizationId)) return deny("blocked");
      if (state.restrictedMinor) return deny("minor_restricted");
      if (!viewer.isSourcingPartner) return deny("not_sourced");
      const can = (p: string) => viewer.permissions.has(p);
      if (!(can("partner.candidates.submit") || can("partner.submissions.view") || can("partner.documents.manage"))) {
        return deny("permission_required", { relationship: { applied: false, unlocked: false, sourced: true } });
      }
      return {
        canView: true,
        denial: null,
        discoverable: false,
        relationship: { applied: false, unlocked: false, sourced: true },
        fullName: true,
        photo: state.privacy.showPhoto,
        contact: "on_reveal",
        contactHiddenReason: null,
        documents: "viewer_uploads",
        resume: true,
        currentEmployer: true,
        references: false,
        identity: false,
        gender: false,
        expectedSalary: true,
        internal: false,
        portfolio: "public",
        directContact: true,
      };
    }
  }
}

/** "Ravi Kumar Reddy" → "R. R." (what employers see until the candidate shares their name). */
export function maskedName(displayName: string | null | undefined): string {
  const parts = (displayName ?? "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "Candidate";
  const first = parts[0]![0]!.toUpperCase();
  const last = parts.length > 1 ? parts[parts.length - 1]![0]!.toUpperCase() : null;
  return last ? `${first}. ${last}.` : `${first}.`;
}
