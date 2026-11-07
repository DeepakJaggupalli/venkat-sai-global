import type { Metadata } from "next";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { PARTNER_PERMISSIONS } from "@/config/permissions";
import { logger } from "@/lib/logger";
import { checkEntitlement } from "@/modules/commercial/entitlements";
import { requireOrgMember } from "@/modules/identity/authz";
import { listInvitations, listMembers, listOrgRoles } from "@/modules/organizations/members";

import { InviteForm } from "./_components/invite-form";
import { RolesManager, type PermissionGroup } from "./_components/roles-manager";
import { PendingInvitations, TeamMembers } from "./_components/team-members";

export const metadata: Metadata = { title: "Team" };

export default async function RecruiterTeamPage() {
  const ctx = await requireOrgMember("recruitment_partner", "partner.team.manage");
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
  const grantableRoles = roles.filter((r) => ctx.isOwner || (r.key !== "owner" && r.permissions.every((p) => held.has(p))));
  const roleOptions = grantableRoles.map((r) => ({ value: r.id, label: r.name }));
  const grantablePermissions = PARTNER_PERMISSIONS.map((p) => p.key).filter((k) => ctx.isOwner || held.has(k));
  const groups: PermissionGroup[] = [];
  for (const p of PARTNER_PERMISSIONS) {
    let group = groups.find((g) => g.group === p.group);
    if (!group) groups.push((group = { group: p.group, items: [] }));
    group.items.push({ key: p.key, label: p.label, sensitive: p.sensitive ?? false });
  }
  const permissionLabels = Object.fromEntries(PARTNER_PERMISSIONS.map((p) => [p.key, p.label]));
  const pending = invitations.filter((i) => i.status === "pending" || i.status === "expired");
  const seatsNote =
    seats && seats.limit !== null ? `${seats.used} of ${seats.limit} seats in use on your plan (active members and pending invitations).${seats.allowed ? "" : ` ${seats.reason ?? ""}`}` : null;

  return (
    <div className="space-y-8">
      <PageHeader title="Team" description="Invite colleagues, give them the right role and manage access to your agency workspace. Members only see what their role allows." />

      <SectionCard title="Invite a team member" description="Invitations are valid for a limited time and can only be accepted by the invited email address.">
        {roleOptions.length ? <InviteForm roleOptions={roleOptions} seatsNote={seatsNote} /> : <p className="text-sm text-muted-foreground">Your role cannot grant any roles.</p>}
      </SectionCard>

      <SectionCard title={`Members (${members.length})`} flush>
        <TeamMembers
          viewerIsOwner={ctx.isOwner}
          roleOptions={roleOptions}
          branchOptions={[]}
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
            branchId: m.branchId,
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

      <SectionCard title="Roles" description="Standard roles are maintained by Venkat Sai. Create custom roles for your own way of working.">
        <RolesManager
          roles={roles.map((r) => ({ id: r.id, key: r.key, name: r.name, description: r.description, permissions: r.permissions, isTemplate: r.isTemplate, memberCount: r.memberCount }))}
          groups={groups}
          grantable={grantablePermissions}
          labels={permissionLabels}
        />
      </SectionCard>
    </div>
  );
}
