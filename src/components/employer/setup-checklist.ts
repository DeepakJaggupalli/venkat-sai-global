/**
 * Employer workspace setup checklist (pure, client-safe). Built from real workspace data on the dashboard;
 * every step links to the page where it is done. Steps the viewer cannot act on are left out.
 */
export type SetupChecklistInput = {
  orgStatus: string;
  hasCompanyDetails: boolean;
  hasLogo: boolean;
  hasAbout: boolean;
  documentRequirementsMet: boolean;
  memberCount: number;
  pendingInvitationCount: number;
  jobCount: number;
  requirementCount: number;
  can: { company: boolean; team: boolean; jobs: boolean; requirements: boolean };
};

export type SetupChecklistItem = { id: string; label: string; done: boolean; href: string; hint?: string };

const SUBMITTED_STATUSES = new Set(["pending", "under_review", "verified"]);

export function buildSetupChecklist(input: SetupChecklistInput): SetupChecklistItem[] {
  const items: SetupChecklistItem[] = [];
  const submitted = SUBMITTED_STATUSES.has(input.orgStatus);
  if (input.can.company) {
    items.push({
      id: "details",
      label: "Complete your company details",
      done: input.hasCompanyDetails,
      href: "/employer/company",
      hint: "Registered address, city and an official email or phone are needed for verification.",
    });
    items.push({ id: "branding", label: "Add your logo and company description", done: input.hasLogo && input.hasAbout, href: "/employer/company#branding" });
    items.push({
      id: "documents",
      label: "Upload your registration documents",
      done: input.documentRequirementsMet || submitted,
      href: "/employer/company/verification",
    });
    items.push({
      id: "verification",
      label: input.orgStatus === "verified" ? "Company verified by Venkat Sai" : "Submit your company for verification",
      done: submitted,
      href: "/employer/company/verification",
      hint: submitted && input.orgStatus !== "verified" ? "Submitted. Venkat Sai is reviewing your documents." : "Jobs can be published once your company is verified.",
    });
  }
  if (input.can.team) {
    items.push({ id: "team", label: "Invite your hiring team", done: input.memberCount > 1 || input.pendingInvitationCount > 0, href: "/employer/team" });
  }
  if (input.can.jobs) {
    items.push({ id: "job", label: "Create your first job", done: input.jobCount > 0, href: "/employer/jobs/new" });
  } else if (input.can.requirements) {
    items.push({ id: "requirement", label: "Send your first workforce requirement", done: input.requirementCount > 0, href: "/employer/requirements/new" });
  }
  return items;
}

export function checklistProgress(items: readonly SetupChecklistItem[]): { done: number; total: number; complete: boolean } {
  const done = items.filter((i) => i.done).length;
  return { done, total: items.length, complete: items.length > 0 && done === items.length };
}
