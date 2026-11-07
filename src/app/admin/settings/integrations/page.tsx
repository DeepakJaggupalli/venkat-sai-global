import type { Metadata } from "next";
import Link from "next/link";
import { Mail } from "lucide-react";

import { ActionForm } from "@/components/admin/action-form";
import { Callout } from "@/components/shared/callout";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { maskEmail } from "@/lib/format";
import { requireStaff, staffCan } from "@/modules/identity/authz";
import { listFeatureFlags } from "@/modules/settings";

import { SETTINGS_CRUMB, SettingsNav } from "../_components/settings-nav";
import { sendTestEmailAction } from "./actions";
import { getIntegrationStatuses, STATE_LABEL } from "./_lib/integration-status";

export const metadata: Metadata = { title: "Integrations" };

/** Feature flags that need a provider; warn when the flag is on but the provider is not ready. */
const FLAG_NEEDS: Record<string, string> = {
  "notifications.sms": "sms",
  "notifications.whatsapp": "whatsapp",
  "commercial.online_payments": "razorpay|stripe",
  "auth.google": "google",
};

export default async function IntegrationsPage() {
  const ctx = await requireStaff("settings.view");
  const statuses = getIntegrationStatuses();
  const flags = await listFeatureFlags();
  const canTest = staffCan(ctx, "settings.integrations");
  const byId = new Map(statuses.map((s) => [s.id, s]));

  const mismatches = flags
    .filter((f) => f.enabled && FLAG_NEEDS[f.key])
    .filter((f) => !FLAG_NEEDS[f.key]!.split("|").some((id) => byId.get(id)?.state === "configured"))
    .map((f) => f.name);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Integrations"
        description="External services the platform uses. Credentials live in server environment variables; this page shows only whether each one is set, never the values."
        breadcrumbs={[{ label: "Command Centre", href: "/admin" }, SETTINGS_CRUMB, { label: "Integrations" }]}
      />
      <SettingsNav />

      {mismatches.length ? (
        <Callout tone="warning" title="Switched on without a working provider" action={{ label: "Review modules", href: "/admin/settings/modules" }}>
          {mismatches.join(", ")}. These features stay inactive or fall back until the provider is configured.
        </Callout>
      ) : null}

      <ul className="grid gap-4 md:grid-cols-2" aria-label="Integrations" data-testid="integrations-list">
        {statuses.map((s) => {
          const st = STATE_LABEL[s.state];
          return (
            <li key={s.id} className="flex flex-col gap-3 rounded-xl border bg-card p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="font-heading text-base font-semibold text-foreground">{s.name}</h2>
                  <p className="text-sm text-muted-foreground">{s.purpose}</p>
                </div>
                <StatusBadge tone={st.tone} size="sm" dot>
                  {st.label}
                </StatusBadge>
              </div>
              <p className="text-sm text-foreground">
                {s.provider ? <span className="font-medium">{s.provider}. </span> : null}
                {s.detail}
              </p>
              <details className="text-sm">
                <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Environment variables</summary>
                <p className="mt-2 flex flex-wrap gap-1.5">
                  {s.variables.map((v) => (
                    <code key={v} className="rounded bg-surface-subtle px-1.5 py-0.5 text-xs">
                      {v}
                    </code>
                  ))}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">Setup guide: {s.docs}</p>
              </details>
            </li>
          );
        })}
      </ul>

      <SectionCard title="Send a test e-mail" description="Checks the e-mail transport end to end. The message goes to your own verified address." icon={<Mail aria-hidden />}>
        {canTest ? (
          ctx.user.email && ctx.user.emailVerifiedAt ? (
            <ActionForm
              action={sendTestEmailAction}
              intro={<p className="text-sm text-muted-foreground">Recipient: {maskEmail(ctx.user.email)}</p>}
              submitLabel="Send test e-mail"
              pendingLabel="Sending…"
              testId="test-email-form"
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              Add and verify an e-mail address in <Link href="/account" className="font-medium text-teal-strong underline underline-offset-4">your account</Link> to send a test.
            </p>
          )
        ) : (
          <p className="text-sm text-muted-foreground">Sending a test needs the “Configure integrations” permission.</p>
        )}
      </SectionCard>
    </div>
  );
}
