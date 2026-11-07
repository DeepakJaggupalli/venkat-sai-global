import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ShieldCheck, ShieldOff } from "lucide-react";

import { ActionForm } from "@/components/admin/action-form";
import { PortalBreadcrumb } from "@/components/layout/portal-breadcrumb";
import { UserAvatar } from "@/components/shared/avatars";
import { Callout } from "@/components/shared/callout";
import { DataTable } from "@/components/shared/data-table";
import { DateText } from "@/components/shared/date-text";
import { EmptyState } from "@/components/shared/empty-state";
import { KeyValueList } from "@/components/shared/key-value-list";
import { PageHeader } from "@/components/shared/page-header";
import { RelativeTime } from "@/components/shared/relative-time";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { humanize } from "@/lib/format";
import { listUserMemberships, requireStaff, staffCan } from "@/modules/identity/authz";
import { getConsentState } from "@/modules/identity/consent";
import { ORG_TYPE_LABELS } from "@/modules/organizations/constants";

import { resetTwoFactorAction, revokeAllSessionsAction, revokeSessionAction, setStaffRolesAction, setUserStatusAction } from "../actions";
import { getUserAdminDetail } from "../_lib/user-admin";

type Params = Promise<{ id: string }>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  if (!UUID.test(id)) return { title: "User" };
  const ctx = await requireStaff("users.view");
  const detail = await getUserAdminDetail(ctx, id);
  return { title: detail?.user.displayName ?? "User" };
}

/** Coarse device label from a user agent (no full string on screen). */
function deviceLabel(ua: string | null): string {
  if (!ua) return "Unknown device";
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Windows/.test(ua) ? "Windows" : /Mac OS/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "";
  return os ? `${browser} on ${os}` : browser;
}

export default async function UserDetailPage({ params }: { params: Params }) {
  const ctx = await requireStaff("users.view");
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const detail = await getUserAdminDetail(ctx, id);
  if (!detail) notFound();
  const { user } = detail;
  const self = user.id === ctx.user.id;
  const canManage = staffCan(ctx, "users.manage") && !self;
  const canSecurity = staffCan(ctx, "users.security") && !self;
  const canRoles = staffCan(ctx, "users.roles") && !self;
  const [memberships, consent] = await Promise.all([listUserMemberships(user.id), getConsentState(user.id)]);
  const roleOptions = detail.platformRoles
    .filter((r) => ctx.isSuperAdmin || r.permissions.every((p) => ctx.permissions.has(p)) || detail.roles.some((cur) => cur.id === r.id))
    .map((r) => ({ value: r.id, label: r.name, description: r.description ?? undefined }));
  const consentEntries = Object.entries(consent);

  return (
    <div className="space-y-6">
      <PortalBreadcrumb items={[{ label: "Users", href: "/admin/users" }, { label: user.displayName }]} />
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            <UserAvatar name={user.displayName} size="md" />
            <span className="min-w-0">{user.displayName}</span>
          </span>
        }
        status={
          <span className="flex flex-wrap gap-2">
            <StatusBadge status={user.status} />
            {user.isStaff ? <StatusBadge tone="brand">Staff</StatusBadge> : null}
          </span>
        }
        backLink={{ href: "/admin/users", label: "Back to users" }}
        actions={detail.candidateId && staffCan(ctx, "candidates.view") ? [{ label: "Candidate profile", href: `/admin/candidates/${detail.candidateId}`, variant: "outline" }] : undefined}
      />

      {self ? (
        <Callout tone="info" title="This is your account">
          Manage your own password, two-factor authentication and sessions from <Link className="underline underline-offset-4" href="/account/security">account security</Link>. Another administrator must change your roles or status.
        </Callout>
      ) : null}
      {user.status === "suspended" ? (
        <Callout tone="danger" title="Suspended">
          {user.statusReason ?? "No reason recorded."}
        </Callout>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-6">
          <SectionCard title="Account">
            <KeyValueList
              columns={2}
              items={[
                { label: "E-mail", value: user.email ? `${user.email}${user.emailVerifiedAt ? " (verified)" : " (not verified)"}` : null },
                { label: "Phone", value: user.phone ? `${user.phone}${user.phoneVerifiedAt ? " (verified)" : " (not verified)"}` : null },
                { label: "Sign-in methods", value: [user.hasPassword ? "Password" : null, detail.twoFactorEnabled ? "Authenticator app (2FA)" : null].filter(Boolean).join(", ") || "One-time codes only" },
                { label: "Language", value: user.locale.toUpperCase() },
                { label: "Joined", value: <DateText value={user.createdAt} /> },
                { label: "Last sign-in", value: user.lastLoginAt ? <DateText value={user.lastLoginAt} mode="datetime" /> : "Never" },
                { label: "Failed sign-in attempts", value: user.failedLoginCount },
                { label: "Locked until", value: user.lockedUntil && user.lockedUntil > new Date() ? <DateText value={user.lockedUntil} mode="datetime" /> : null },
                { label: "Sign-up source", value: user.signupSource ? humanize(user.signupSource) : null },
              ]}
            />
          </SectionCard>

          <SectionCard title={`Organisation memberships (${memberships.length})`} flush>
            <DataTable
              caption="Organisation memberships"
              rows={memberships}
              getRowId={(m) => m.organizationId}
              bordered={false}
              rowLink={(m) => ({ href: `/admin/organizations/${m.organizationId}`, label: `Open ${m.organizationName}` })}
              columns={[
                { id: "org", header: "Organisation", primary: true, cell: (m) => <span className="font-medium">{m.organizationName}</span> },
                { id: "type", header: "Type", cell: (m) => ORG_TYPE_LABELS[m.organizationType] },
                { id: "role", header: "Role", cell: (m) => m.roleName },
                { id: "status", header: "Membership", cell: (m) => <StatusBadge status={m.memberStatus} size="sm" /> },
              ]}
              empty={<EmptyState size="sm" variant="plain" title="No organisation memberships" />}
            />
          </SectionCard>

          <SectionCard title="Consent" description="Current state from the consent ledger.">
            {consentEntries.length ? (
              <ul className="divide-y divide-border">
                {consentEntries.map(([purpose, state]) => (
                  <li key={purpose} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                    <span>{humanize(purpose)}</span>
                    <span className="flex items-center gap-2 text-xs text-muted-foreground">
                      <StatusBadge tone={state!.granted ? "success" : "neutral"} size="sm">
                        {state!.granted ? "Given" : "Withdrawn"}
                      </StatusBadge>
                      <DateText value={state!.at} />
                      {state!.policyVersion ? ` · v${state!.policyVersion}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No consent recorded.</p>
            )}
          </SectionCard>

          <SectionCard title="Security events" description="The latest 25 events for this account.">
            {detail.securityEvents.length ? (
              <ul className="divide-y divide-border">
                {detail.securityEvents.map((e) => (
                  <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                    <span className="flex items-center gap-2">
                      <StatusBadge tone={e.severity === "critical" ? "danger" : e.severity === "warning" ? "warning" : "neutral"} size="sm">
                        {humanize(e.severity)}
                      </StatusBadge>
                      {humanize(e.type)}
                    </span>
                    <RelativeTime value={e.occurredAt} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No security events.</p>
            )}
          </SectionCard>
        </div>

        <aside className="space-y-6" aria-label="Account administration">
          <SectionCard title="Staff roles" description={user.isStaff ? "Platform roles decide what this person can do in the Command Centre." : "Give roles to make this person a staff member."}>
            {detail.roles.length ? (
              <ul className="mb-4 flex flex-wrap gap-1.5">
                {detail.roles.map((r) => (
                  <li key={r.id}>
                    <StatusBadge tone="brand" size="sm">
                      {r.name}
                    </StatusBadge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mb-4 text-sm text-muted-foreground">No staff roles.</p>
            )}
            {canRoles ? (
              <ActionForm
                action={setStaffRolesAction}
                hidden={{ userId: user.id }}
                fields={[{ name: "roleIds", label: "Roles", kind: "multi", options: roleOptions, defaultValues: detail.roles.map((r) => r.id), hint: "Removing roles signs the person out" }]}
                submitLabel="Save roles"
                submitVariant="outline"
              />
            ) : null}
          </SectionCard>

          <SectionCard title="Sessions and two-factor">
            <div className="space-y-4">
              <p className="flex items-center gap-2 text-sm">
                {detail.twoFactorEnabled ? <ShieldCheck aria-hidden="true" className="size-4 text-success-strong" /> : <ShieldOff aria-hidden="true" className="size-4 text-muted-foreground" />}
                {detail.twoFactorEnabled ? "Two-factor authentication is on" : "Two-factor authentication is off"}
              </p>
              {detail.sessions.length ? (
                <ul className="space-y-2">
                  {detail.sessions.map((s) => (
                    <li key={s.key} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-2.5 text-sm">
                      <span>
                        <span className="block font-medium">{deviceLabel(s.userAgent)}</span>
                        <span className="text-xs text-muted-foreground">
                          Active <RelativeTime value={s.lastSeenAt} />
                        </span>
                      </span>
                      {canSecurity ? <ActionForm action={revokeSessionAction} hidden={{ userId: user.id, sessionKey: s.key }} submitLabel="End" pendingLabel="Ending…" submitVariant="outline" /> : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">No active sessions.</p>
              )}
              {canSecurity && detail.sessions.length > 1 ? (
                <ActionForm action={revokeAllSessionsAction} hidden={{ userId: user.id }} submitLabel="Sign out of every device" submitVariant="outline" />
              ) : null}
              {canSecurity && detail.twoFactorEnabled ? (
                <details className="rounded-lg border border-border p-3">
                  <summary className="cursor-pointer text-sm font-medium">Reset two-factor authentication</summary>
                  <div className="mt-3">
                    <ActionForm
                      action={resetTwoFactorAction}
                      hidden={{ userId: user.id }}
                      intro={<p className="text-sm text-muted-foreground">Use only after confirming the person&rsquo;s identity (for example a lost phone). They are signed out and set up 2FA again.</p>}
                      fields={[{ name: "reason", label: "How you verified the request", kind: "textarea", required: true, rows: 2 }]}
                      submitLabel="Reset 2FA"
                      submitVariant="destructive"
                    />
                  </div>
                </details>
              ) : null}
            </div>
          </SectionCard>

          {canManage && user.status !== "closed" && user.status !== "pending_verification" ? (
            <SectionCard title="Account status">
              <ActionForm
                action={setUserStatusAction}
                hidden={{ userId: user.id, status: user.status === "suspended" ? "active" : "suspended" }}
                intro={
                  <p className="text-sm text-muted-foreground">
                    {user.status === "suspended" ? "Restores sign-in. The person is not notified automatically." : "Suspension signs the person out everywhere and blocks sign-in."}
                  </p>
                }
                fields={[{ name: "reason", label: "Reason", kind: "textarea", required: true, rows: 2 }]}
                submitLabel={user.status === "suspended" ? "Reactivate account" : "Suspend account"}
                submitVariant={user.status === "suspended" ? "default" : "destructive"}
              />
            </SectionCard>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
