import type { Metadata } from "next";

import { InviteForm, PendingInvitations, TeamMembers } from "@/components/institution/team";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { INSTITUTION_PERMISSIONS } from "@/config/permissions";
import { logger } from "@/lib/logger";
import { checkEntitlement } from "@/modules/commercial/entitlements";
import { requireOrgMember } from "@/modules/identity/authz";
import { listInvitations, listMembers, listOrgRoles } from "@/modules/organizations/members";

export const metadata: Metadata = { title: "Team" };

export default async function InstitutionTeamPage() {
  const ctx = await requireOrgMember("institution", "institution.team.manage");
  const orgId = ctx.organization.id;
  const [members, invitations, roles, seats] = await Promise.all([
    listMembers(ctx, orgId),
    listInvitations(ctx, orgId),
    listOrgRoles(ctx, orgId),
    checkEntitlement(orgId, "team_seats").catch((error: unknown) => {
      logger.warn("Seat check failed", { error });
      return null;
    }),
  ]);

  // Escalation guard (enforced by the service): owners grant anything; others only roles within their own permissions.
  const held = ctx.permissions;
  const grantable = roles.filter((r) => ctx.isOwner || (r.key !== "owner" && r.permissions.every((p) => held.has(p))));
  const roleOptions = grantable.map((r) => ({ value: r.id, label: r.name }));
  const permissionLabels = new Map<string, string>(INSTITUTION_PERMISSIONS.map((p) => [p.key, p.label]));
  const pending = invitations.filter((i) => i.status === "pending" || i.status === "expired");
  const seatsNote =
    seats && seats.limit !== null ? `${seats.used} of ${seats.limit} seats in use on your plan (active members and pending invitations).${seats.allowed ? "" : ` ${seats.reason ?? ""}`}` : null;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Team"
        description="Invite coordinators, instructors and placement officers, give them the right role and manage access."
        breadcrumbs={[{ label: "Institution", href: "/institution" }, { label: "Team" }]}
      />

      <SectionCard title="Invite a team member" description="Invitations are valid for a limited time and can only be accepted by the invited email address.">
        {roleOptions.length ? <InviteForm roleOptions={roleOptions} seatsNote={seatsNote} /> : <p className="text-sm text-muted-foreground">Your role cannot grant any roles.</p>}
      </SectionCard>

      <SectionCard title={`Members (${members.length})`} flush>
        <TeamMembers
          viewerIsOwner={ctx.isOwner}
          roleOptions={roleOptions}
          members={members.map((m) => ({
            id: m.id,
            displayName: m.displayName,
            email: m.email,
            roleId: m.roleId,
            roleName: m.roleName,
            isOwner: m.isOwner,
            status: m.status,
            jobTitle: m.jobTitle,
            department: m.department,
            lastActiveAt: m.lastActiveAt,
            isSelf: m.userId === ctx.user.id,
          }))}
        />
      </SectionCard>

      <SectionCard title="Pending invitations" flush>
        {pending.length ? (
          <PendingInvitations invitations={pending.map((i) => ({ id: i.id, email: i.email, roleName: i.roleName, status: i.status, expiresAt: i.expiresAt, invitedByName: i.invitedByName }))} />
        ) : (
          <div className="p-5">
            <EmptyState size="sm" variant="plain" title="No pending invitations" description="People you invite appear here until they accept." />
          </div>
        )}
      </SectionCard>

      <SectionCard title="Roles" description="What each role can do. Instructors without batch management see and manage only the batches they are assigned to." flush>
        <ul className="divide-y divide-border">
          {roles.map((r) => (
            <li key={r.id} className="space-y-2 px-5 py-4">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium text-foreground">{r.name}</p>
                <StatusBadge tone={r.isTemplate ? "neutral" : "brand"} size="sm">
                  {r.isTemplate ? "Standard role" : "Custom role"}
                </StatusBadge>
                <span className="text-sm text-muted-foreground">
                  {r.memberCount} member{r.memberCount === 1 ? "" : "s"}
                </span>
              </div>
              {r.description ? <p className="text-sm text-muted-foreground">{r.description}</p> : null}
              <p className="text-sm text-foreground">{r.permissions.map((p) => permissionLabels.get(p) ?? p).join(" · ") || "No permissions"}</p>
            </li>
          ))}
        </ul>
      </SectionCard>
    </div>
  );
}
