import type { Metadata } from "next";
import { SlidersHorizontal } from "lucide-react";

import { ActionForm } from "@/components/admin/action-form";
import { DateText } from "@/components/shared/date-text";
import { PageHeader } from "@/components/shared/page-header";
import { ResponsiveDialog } from "@/components/shared/responsive-dialog";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { PORTALS } from "@/db/schema/_constants";
import { env } from "@/lib/env";
import { humanize } from "@/lib/format";
import { requireStaff, staffCan } from "@/modules/identity/authz";
import { listFeatureFlags } from "@/modules/settings";

import { SETTINGS_CRUMB, SettingsNav } from "../_components/settings-nav";
import { ToggleSwitch } from "../_components/toggle-switch";
import { saveFlagRulesAction, toggleFlagAction } from "./actions";

export const metadata: Metadata = { title: "Modules and feature flags" };

const PORTAL_LABELS: Record<string, string> = {
  public: "Public website",
  talent: "People Portal",
  employer: "Employer Portal",
  recruiter: "Partner Portal",
  institution: "Institution Portal",
  admin: "Command Centre",
};
const portalOptions = PORTALS.map((p) => ({ value: p, label: PORTAL_LABELS[p] ?? humanize(p) }));

type Rules = { portals?: string[]; orgIds?: string[]; staffOnly?: boolean };

function describeRules(rules: Rules): string[] {
  const out: string[] = [];
  if (rules.staffOnly) out.push("Staff only");
  if (rules.portals?.length) out.push(`Only in ${rules.portals.map((p) => PORTAL_LABELS[p] ?? p).join(", ")}`);
  if (rules.orgIds?.length) out.push(`Limited to ${rules.orgIds.length} organisation${rules.orgIds.length === 1 ? "" : "s"}`);
  return out;
}

export default async function ModulesPage() {
  const ctx = await requireStaff("settings.view");
  const timeZone = ctx.user.timezone ?? env().DEFAULT_TIMEZONE;
  const canEdit = staffCan(ctx, "settings.flags");
  const flags = await listFeatureFlags();
  const categories = [...new Set(flags.map((f) => f.category))];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Modules and feature flags"
        description="Switch portals and services on or off without a code change. Switching off a portal hides it immediately for everyone except the Command Centre."
        breadcrumbs={[{ label: "Command Centre", href: "/admin" }, SETTINGS_CRUMB, { label: "Modules" }]}
      />
      <SettingsNav />
      {!canEdit ? <p className="text-sm text-muted-foreground">You can view modules. Changing them needs the “Toggle modules and feature flags” permission.</p> : null}

      {categories.map((category) => (
        <SectionCard key={category} title={category} flush>
          <ul className="divide-y">
            {flags
              .filter((f) => f.category === category)
              .map((flag) => {
                const rules = (flag.rules ?? {}) as Rules;
                const ruleText = describeRules(rules);
                const isPortal = flag.key.startsWith("portal.");
                return (
                  <li key={flag.key} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between" data-testid={`flag-${flag.key}`}>
                    <div className="min-w-0 space-y-1">
                      <p className="font-medium text-foreground">{flag.name}</p>
                      <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                        <code className="rounded bg-surface-subtle px-1 py-0.5">{flag.key}</code>
                        {flag.isDefault ? <span>Default setting</span> : flag.updatedAt ? <span>Changed <DateText value={flag.updatedAt} mode="datetime" timeZone={timeZone} /></span> : null}
                        {ruleText.map((r) => (
                          <StatusBadge key={r} tone="info" size="sm">
                            {r}
                          </StatusBadge>
                        ))}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      {canEdit ? (
                        <ResponsiveDialog
                          title={`Rules for ${flag.name}`}
                          description="Rules narrow where an enabled feature applies. With no rules it applies everywhere."
                          trigger={
                            <Button variant="ghost" size="sm">
                              <SlidersHorizontal aria-hidden className="size-4" /> Rules<span className="sr-only"> for {flag.name}</span>
                            </Button>
                          }
                        >
                          <ActionForm
                            action={saveFlagRulesAction}
                            hidden={{ key: flag.key }}
                            fields={[
                              { name: "portals", label: "Only in these portals", kind: "multi", options: portalOptions, defaultValues: rules.portals ?? [], hint: "Leave empty for every portal." },
                              { name: "staffOnly", label: "Staff only (pilot with the Venkat Sai team first)", kind: "checkbox", defaultValue: rules.staffOnly === true },
                            ]}
                            submitLabel="Save rules"
                          />
                        </ResponsiveDialog>
                      ) : null}
                      <span className="w-8 text-right text-sm text-muted-foreground" aria-hidden>
                        {flag.enabled ? "On" : "Off"}
                      </span>
                      <ToggleSwitch
                        checked={flag.enabled}
                        label={`${flag.name}: ${flag.enabled ? "on" : "off"}`}
                        disabled={!canEdit}
                        action={toggleFlagAction.bind(null, flag.key)}
                        confirmOff={isPortal ? { title: `Switch off the ${flag.name}?`, description: "Everyone using this portal loses access straight away. Their data is kept and returns when you switch it back on." } : undefined}
                        testId={`toggle-${flag.key}`}
                      />
                    </div>
                  </li>
                );
              })}
          </ul>
        </SectionCard>
      ))}
    </div>
  );
}
