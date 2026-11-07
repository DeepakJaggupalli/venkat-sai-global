import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Blocks, KeyRound, Network, PlugZap, ShieldCheck, Tags, Workflow } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { env } from "@/lib/env";
import { requireStaff, staffCan } from "@/modules/identity/authz";
import { countryOptions, currencyOptions } from "@/modules/taxonomy/queries";

import { SETTINGS_CRUMB, SettingsNav } from "./_components/settings-nav";
import { SettingsGroupCard } from "./_components/settings-group-card";
import { DEDICATED_GROUPS, settingGroups } from "./_lib/catalog";
import { editPermissionFor, loadSettingStates } from "./_lib/settings-admin";

export const metadata: Metadata = { title: "Settings" };

const AREAS = [
  { href: "/admin/settings/modules", title: "Modules and feature flags", description: "Switch portals and optional services on or off.", icon: Blocks },
  { href: "/admin/settings/roles", title: "Roles and permissions", description: "Staff roles and organisation role templates.", icon: KeyRound },
  { href: "/admin/settings/taxonomies", title: "Taxonomies", description: "Countries, languages, currencies, industries, categories and skills.", icon: Tags },
  { href: "/admin/settings/workflows", title: "Application workflows", description: "Pipeline stages and what candidates see at each one.", icon: Workflow },
  { href: "/admin/settings/security", title: "Security", description: "Two-factor requirement, password policy and lockout.", icon: ShieldCheck },
  { href: "/admin/settings/integrations", title: "Integrations", description: "E-mail, SMS, WhatsApp, payments, sign-in and storage.", icon: PlugZap },
];

const GROUP_DESCRIPTIONS: Record<string, string> = {
  Privacy: "Response times and notice versions under the DPDP Act and IT Rules. Public pages read these values; they are never hard-coded.",
  Analytics: "How long analytics data is kept and optional third-party tools (used only with visitor consent).",
  Commercial: "Billing defaults and the seller details printed on invoices.",
  Organisations: "Team invitations for employers, partners and institutions.",
  Recruitment: "Application, listing and attribution rules.",
  Platform: "Market-wide behaviour.",
  Support: "First-response targets for support tickets.",
};

export default async function SettingsPage() {
  const ctx = await requireStaff("settings.view");
  const timeZone = ctx.user.timezone ?? env().DEFAULT_TIMEZONE;
  const groups = settingGroups().filter((g) => !DEDICATED_GROUPS[g.group]);
  const [states, currencies, countries] = await Promise.all([loadSettingStates(groups.flatMap((g) => g.keys)), currencyOptions(), countryOptions()]);
  const canManage = staffCan(ctx, "settings.manage");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Platform-wide configuration for Venkat Sai Global. Changes take effect immediately and are recorded in the audit log."
        breadcrumbs={[{ label: "Command Centre", href: "/admin" }, { label: SETTINGS_CRUMB.label }]}
      />
      <SettingsNav />

      <nav aria-label="Settings areas" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {AREAS.map((a) => (
          <Link
            key={a.href}
            href={a.href}
            className="group flex items-start gap-3 rounded-xl border bg-card p-4 transition-colors hover:border-teal hover:bg-teal-soft/40 focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            <span aria-hidden className="mt-0.5 rounded-lg bg-teal-soft p-2 text-teal-strong">
              <a.icon className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1 font-heading font-semibold text-foreground">
                {a.title}
                <ArrowRight aria-hidden className="size-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
              </span>
              <span className="mt-0.5 block text-sm text-muted-foreground">{a.description}</span>
            </span>
          </Link>
        ))}
      </nav>

      {!canManage ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Network aria-hidden className="size-4" /> You can view these settings. Editing needs the “Edit general settings” permission.
        </p>
      ) : null}

      <div className="space-y-6">
        {groups.map((g) => (
          <SettingsGroupCard
            key={g.group}
            group={g.group}
            description={GROUP_DESCRIPTIONS[g.group]}
            keys={g.keys}
            states={states}
            canEdit={staffCan(ctx, editPermissionFor(g.group))}
            currencies={currencies}
            countries={countries}
            timeZone={timeZone}
          />
        ))}
      </div>
    </div>
  );
}
