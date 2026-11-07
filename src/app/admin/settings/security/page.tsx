import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, count, eq, gt, gte, inArray, isNull, or } from "drizzle-orm";
import { ShieldAlert } from "lucide-react";

import { Callout } from "@/components/shared/callout";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatCard, StatGrid } from "@/components/shared/stat-card";
import { db } from "@/db";
import { securityEvents, sessions, users, userTwoFactor } from "@/db/schema";
import { env } from "@/lib/env";
import { requireStaff, staffCan } from "@/modules/identity/authz";
import { getSetting } from "@/modules/settings";

import { SETTINGS_CRUMB, SettingsNav } from "../_components/settings-nav";
import { SettingsGroupCard } from "../_components/settings-group-card";
import { settingGroups } from "../_lib/catalog";
import { loadSettingStates } from "../_lib/settings-admin";

export const metadata: Metadata = { title: "Security settings" };

async function loadSecurityOverview() {
  const now = new Date();
  const dayAgo = new Date(now.getTime() - 24 * 3600_000);
  const [activeSessions, staffSessions, locked, events, staffWithout2fa] = await Promise.all([
    db.select({ value: count() }).from(sessions).where(gt(sessions.expiresAt, now)),
    db
      .select({ value: count() })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(and(gt(sessions.expiresAt, now), eq(users.isStaff, true))),
    db.select({ value: count() }).from(users).where(gt(users.lockedUntil, now)),
    db
      .select({ severity: securityEvents.severity, value: count() })
      .from(securityEvents)
      .where(and(gte(securityEvents.occurredAt, dayAgo), inArray(securityEvents.severity, ["warning", "critical"])))
      .groupBy(securityEvents.severity),
    db
      .select({ id: users.id, name: users.displayName })
      .from(users)
      .leftJoin(userTwoFactor, eq(userTwoFactor.userId, users.id))
      .where(and(eq(users.isStaff, true), eq(users.status, "active"), or(isNull(userTwoFactor.userId), isNull(userTwoFactor.enabledAt))))
      .orderBy(asc(users.displayName))
      .limit(50),
  ]);
  const bySeverity = Object.fromEntries(events.map((e) => [e.severity, e.value]));
  return {
    activeSessions: activeSessions[0]?.value ?? 0,
    staffSessions: staffSessions[0]?.value ?? 0,
    locked: locked[0]?.value ?? 0,
    warnings: bySeverity.warning ?? 0,
    critical: bySeverity.critical ?? 0,
    staffWithout2fa,
  };
}

export default async function SecuritySettingsPage() {
  const ctx = await requireStaff("settings.view");
  const timeZone = ctx.user.timezone ?? env().DEFAULT_TIMEZONE;
  const keys = settingGroups().find((g) => g.group === "Security")?.keys ?? [];
  const [states, overview, require2fa] = await Promise.all([loadSettingStates(keys), loadSecurityOverview(), getSetting("security.require_staff_2fa")]);
  const canAudit = staffCan(ctx, "audit.view");
  const canUsers = staffCan(ctx, "users.view");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Security"
        description="Sign-in protection for every account. Production deployments should always require two-factor authentication for staff."
        breadcrumbs={[{ label: "Command Centre", href: "/admin" }, SETTINGS_CRUMB, { label: "Security" }]}
      />
      <SettingsNav />

      <StatGrid columns={4}>
        <StatCard label="Active sessions" value={overview.activeSessions} hint="Signed-in browsers and devices, all accounts" />
        <StatCard label="Staff sessions" value={overview.staffSessions} hint="Sessions of Venkat Sai staff accounts" />
        <StatCard label="Locked accounts" value={overview.locked} hint="Temporarily locked after failed sign-ins" />
        <StatCard
          label="Security alerts (24 hours)"
          value={overview.warnings + overview.critical}
          hint={`${overview.critical} critical, ${overview.warnings} warnings`}
          href={canAudit ? "/admin/audit/security" : undefined}
        />
      </StatGrid>

      {!require2fa ? (
        <Callout tone="warning" title="Two-factor authentication is not required for staff">
          Staff can reach the Command Centre with a password alone. Turn on the requirement below before going live.
        </Callout>
      ) : null}

      <SettingsGroupCard
        group="Security"
        title="Sign-in policy"
        description="Password length applies to new and changed passwords. Lockout protects against password guessing; each failed attempt is recorded as a security event."
        keys={keys}
        states={states}
        canEdit={staffCan(ctx, "settings.security")}
        currencies={[]}
        countries={[]}
        timeZone={timeZone}
      />

      <SectionCard
        title="Staff without two-factor authentication"
        description="Active staff accounts that have not finished setting up an authenticator app."
        icon={<ShieldAlert aria-hidden />}
        flush={overview.staffWithout2fa.length > 0}
      >
        {overview.staffWithout2fa.length ? (
          <ul className="divide-y" data-testid="staff-without-2fa">
            {overview.staffWithout2fa.map((u) => (
              <li key={u.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                <span className="min-w-0 truncate font-medium">{u.name}</span>
                {canUsers ? (
                  <Link href={`/admin/users/${u.id}`} className="shrink-0 text-sm font-medium text-teal-strong underline-offset-4 hover:underline">
                    Open account<span className="sr-only"> of {u.name}</span>
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState size="sm" variant="plain" title="Every active staff member uses two-factor authentication" description="New staff are asked to set it up at their first sign-in when the requirement is on." />
        )}
      </SectionCard>
    </div>
  );
}
