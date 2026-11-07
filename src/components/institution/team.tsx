"use client";

/** Team management for the active institution (organisations module enforces escalation guards, seat limits and last-owner protection). */

import { MoreHorizontal } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { UserAvatar } from "@/components/shared/avatars";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { FormErrorAlert, FormField, SubmitButton, useActionToast } from "@/components/shared/form";
import { RelativeTime } from "@/components/shared/relative-time";
import { ResponsiveDialog } from "@/components/shared/responsive-dialog";
import { SimpleSelect } from "@/components/shared/selects";
import { StatusBadge } from "@/components/shared/status-badge";
import type { SelectOption } from "@/components/shared/types";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

import {
  changeMemberRoleAction,
  inviteMemberAction,
  removeMemberAction,
  resendInvitationAction,
  revokeInvitationAction,
  setMemberStatusAction,
  transferOwnershipAction,
  updateMemberDetailsAction,
} from "@/modules/organizations/member-actions";

import { useInstitutionForm } from "./use-form-action";

export type TeamMember = {
  id: string;
  displayName: string;
  email: string | null;
  roleId: string;
  roleName: string;
  isOwner: boolean;
  status: "invited" | "active" | "disabled";
  jobTitle: string | null;
  department: string | null;
  lastActiveAt: Date | null;
  isSelf: boolean;
};

export type TeamInvitation = { id: string; email: string; roleName: string; status: string; expiresAt: Date; invitedByName: string | null };

function RoleForm({ member, roleOptions, onDone }: { member: TeamMember; roleOptions: SelectOption[]; onDone: () => void }) {
  const [roleId, setRoleId] = useState(member.roleId);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={async (event) => {
        event.preventDefault();
        setPending(true);
        const result = await changeMemberRoleAction({ orgType: "institution", memberId: member.id, roleId });
        setPending(false);
        if (result.ok) {
          toast.success(result.message ?? "Role updated.");
          onDone();
        } else setError(result.error);
      }}
    >
      {error ? (
        <p role="alert" className="rounded-md bg-danger-soft p-3 text-sm font-medium text-danger-strong">
          {error}
        </p>
      ) : null}
      <FormField label="Role" name="roleId" required hint="You can only give roles whose permissions you hold yourself.">
        <SimpleSelect options={roleOptions} value={roleId} onValueChange={setRoleId} />
      </FormField>
      <div className="flex justify-end">
        <SubmitButton pending={pending} pendingLabel="Saving…">
          Change role
        </SubmitButton>
      </div>
    </form>
  );
}

function DetailsForm({ member, onDone }: { member: TeamMember; onDone: () => void }) {
  const { state, pending, onSubmit } = useInstitutionForm(updateMemberDetailsAction);
  useActionToast(state);
  useEffect(() => {
    if (state?.ok) onDone();
  }, [state, onDone]);
  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <input type="hidden" name="memberId" value={member.id} />
      <input type="hidden" name="orgType" value="institution" />
      <FormErrorAlert state={state} />
      <FormField label="Designation" name="jobTitle" optional state={state}>
        <Input defaultValue={member.jobTitle ?? undefined} maxLength={120} />
      </FormField>
      <FormField label="Department" name="department" optional state={state}>
        <Input defaultValue={member.department ?? undefined} maxLength={120} />
      </FormField>
      <div className="flex justify-end">
        <SubmitButton pending={pending} pendingLabel="Saving…">
          Save details
        </SubmitButton>
      </div>
    </form>
  );
}

type DialogKind = "role" | "details" | "status" | "remove" | "owner" | null;

function MemberActions({ member, roleOptions, viewerIsOwner }: { member: TeamMember; roleOptions: SelectOption[]; viewerIsOwner: boolean }) {
  const [dialog, setDialog] = useState<DialogKind>(null);
  const close = useCallback(() => setDialog(null), []);
  const disabling = member.status === "active";
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={`Actions for ${member.displayName}`}>
            <MoreHorizontal aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setDialog("details")}>Edit details</DropdownMenuItem>
          {!member.isSelf ? <DropdownMenuItem onSelect={() => setDialog("role")}>Change role</DropdownMenuItem> : null}
          {!member.isSelf ? <DropdownMenuItem onSelect={() => setDialog("status")}>{disabling ? "Disable access" : "Re-enable access"}</DropdownMenuItem> : null}
          {viewerIsOwner && !member.isOwner && member.status === "active" ? <DropdownMenuItem onSelect={() => setDialog("owner")}>Make owner</DropdownMenuItem> : null}
          {!member.isSelf ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => setDialog("remove")}>
                Remove from workspace
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <ResponsiveDialog open={dialog === "role"} onOpenChange={(o) => setDialog(o ? "role" : null)} title={`Change ${member.displayName}'s role`}>
        <RoleForm member={member} roleOptions={roleOptions} onDone={close} />
      </ResponsiveDialog>
      <ResponsiveDialog open={dialog === "details"} onOpenChange={(o) => setDialog(o ? "details" : null)} title={`${member.displayName}: details`}>
        <DetailsForm member={member} onDone={close} />
      </ResponsiveDialog>
      <ConfirmDialog
        open={dialog === "status"}
        onOpenChange={(o) => setDialog(o ? "status" : null)}
        title={disabling ? `Disable ${member.displayName}?` : `Re-enable ${member.displayName}?`}
        description={disabling ? "They will lose access to this workspace until you re-enable them. Their past activity stays." : "They will be able to open this workspace again with their role."}
        confirmLabel={disabling ? "Disable access" : "Re-enable"}
        variant={disabling ? "destructive" : "default"}
        onConfirm={() => setMemberStatusAction({ orgType: "institution", memberId: member.id, status: disabling ? "disabled" : "active" })}
      />
      <ConfirmDialog
        open={dialog === "remove"}
        onOpenChange={(o) => setDialog(o ? "remove" : null)}
        title={`Remove ${member.displayName}?`}
        description="They will lose access to this workspace. You can invite them again later."
        confirmLabel="Remove member"
        variant="destructive"
        onConfirm={() => removeMemberAction({ orgType: "institution", memberId: member.id })}
      />
      <ConfirmDialog
        open={dialog === "owner"}
        onOpenChange={(o) => setDialog(o ? "owner" : null)}
        title={`Make ${member.displayName} the owner?`}
        description="They get full control of the workspace, including billing and the team. You will become an admin."
        confirmLabel="Transfer ownership"
        onConfirm={() => transferOwnershipAction({ orgType: "institution", memberId: member.id })}
      />
    </>
  );
}

export function TeamMembers({ members, roleOptions, viewerIsOwner }: { members: TeamMember[]; roleOptions: SelectOption[]; viewerIsOwner: boolean }) {
  return (
    <ul className="divide-y divide-border" aria-label="Team members">
      {members.map((m) => (
        <li key={m.id} className="flex items-start gap-3 px-5 py-4" data-testid="team-member">
          <UserAvatar name={m.displayName} size="md" />
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium text-foreground">
                {m.displayName}
                {m.isSelf ? <span className="text-muted-foreground"> (you)</span> : null}
              </p>
              <StatusBadge tone={m.isOwner ? "brand" : "neutral"} size="sm">
                {m.roleName}
              </StatusBadge>
              {m.status !== "active" ? <StatusBadge status={m.status} domain="generic" size="sm" /> : null}
            </div>
            <p className="truncate text-sm text-muted-foreground">{[m.email, m.jobTitle, m.department].filter(Boolean).join(" · ")}</p>
            <p className="text-xs text-muted-foreground">{m.lastActiveAt ? <>Last active <RelativeTime value={m.lastActiveAt} /></> : "Not active yet"}</p>
          </div>
          <MemberActions member={m} roleOptions={roleOptions} viewerIsOwner={viewerIsOwner} />
        </li>
      ))}
    </ul>
  );
}

export function PendingInvitations({ invitations }: { invitations: TeamInvitation[] }) {
  return (
    <ul className="divide-y divide-border" aria-label="Pending invitations">
      {invitations.map((inv) => (
        <li key={inv.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between" data-testid="team-invitation">
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground">{inv.email}</p>
            <p className="text-sm text-muted-foreground">
              {inv.roleName}
              {inv.invitedByName ? ` · invited by ${inv.invitedByName}` : ""} · {inv.status === "expired" ? "expired" : <>expires <RelativeTime value={inv.expiresAt} /></>}
            </p>
          </div>
          <div className="flex gap-2">
            <ConfirmDialog
              trigger={
                <Button variant="outline" size="sm">
                  Resend
                </Button>
              }
              title={`Resend the invitation to ${inv.email}?`}
              description="A new link is emailed and the previous link stops working."
              confirmLabel="Resend invitation"
              onConfirm={() => resendInvitationAction({ orgType: "institution", invitationId: inv.id })}
            />
            <ConfirmDialog
              trigger={
                <Button variant="ghost" size="sm">
                  Cancel
                </Button>
              }
              title={`Cancel the invitation to ${inv.email}?`}
              description="The link stops working. You can invite them again later."
              confirmLabel="Cancel invitation"
              cancelLabel="Keep invitation"
              variant="destructive"
              onConfirm={() => revokeInvitationAction({ orgType: "institution", invitationId: inv.id })}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function InviteForm({ roleOptions, seatsNote }: { roleOptions: SelectOption[]; seatsNote?: string | null }) {
  const { state, pending, onSubmit } = useInstitutionForm(inviteMemberAction);
  const [formKey, setFormKey] = useState(0);
  const last = useRef(state);
  useActionToast(state);
  useEffect(() => {
    if (state !== last.current && state?.ok) setFormKey((k) => k + 1);
    last.current = state;
  }, [state]);

  return (
    <form key={formKey} onSubmit={onSubmit} noValidate className="space-y-4" aria-label="Invite a team member">
      <input type="hidden" name="orgType" value="institution" />
      <FormErrorAlert state={state} fieldLabels={{ email: "Email address", roleId: "Role" }} />
      <div className="grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto] sm:items-end">
        <FormField label="Email address" name="email" required state={state} hint="They must sign in with this address to accept.">
          <Input type="email" autoComplete="off" maxLength={254} placeholder="name@institution.edu" />
        </FormField>
        <FormField label="Role" name="roleId" required state={state}>
          <SimpleSelect options={roleOptions} defaultValue={roleOptions.find((r) => /instructor/i.test(r.label))?.value} placeholder="Choose a role" />
        </FormField>
        <SubmitButton pending={pending} pendingLabel="Sending…" className="sm:mb-[1.6rem]">
          Send invitation
        </SubmitButton>
      </div>
      {seatsNote ? <p className="text-sm text-muted-foreground">{seatsNote}</p> : null}
      <p className="sr-only" aria-live="polite">
        {state?.ok ? state.message : ""}
      </p>
    </form>
  );
}
