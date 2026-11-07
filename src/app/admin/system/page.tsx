import type { Metadata } from "next";
import { Activity, Database, Server } from "lucide-react";

import { Callout } from "@/components/shared/callout";
import { KeyValueList } from "@/components/shared/key-value-list";
import { PageHeader } from "@/components/shared/page-header";
import { RelativeTime } from "@/components/shared/relative-time";
import { SectionCard } from "@/components/shared/section-card";
import { StatCard, StatGrid } from "@/components/shared/stat-card";
import { env } from "@/lib/env";
import { formatFileSize } from "@/lib/format";
import { requireStaff, staffCan } from "@/modules/identity/authz";

import packageJson from "../../../../package.json";
import { anyDevTransport } from "../settings/integrations/_lib/integration-status";
import { SystemNav } from "./_components/system-nav";
import { configurationWarnings, databaseHealth, queueOverview } from "./_lib/system";

export const metadata: Metadata = { title: "System" };

const TONE = { danger: "danger", warning: "warning", info: "info" } as const;

export default async function SystemPage() {
  const ctx = await requireStaff("system.jobs");
  const [dbHealth, queue] = await Promise.all([databaseHealth(), queueOverview()]);
  const warnings = await configurationWarnings(queue);
  const e = env();
  const showOutbox = staffCan(ctx, "system.dev_outbox") && anyDevTransport();
  const deps = packageJson.dependencies as Record<string, string>;

  return (
    <div className="space-y-6">
      <PageHeader
        title="System"
        description="Health of the platform: database, background tasks and configuration. Checked live each time this page loads."
        breadcrumbs={[{ label: "Command Centre", href: "/admin" }, { label: "System" }]}
      />
      <SystemNav showOutbox={showOutbox} />

      <StatGrid columns={4}>
        <StatCard label="Database" value={dbHealth.ok ? "Reachable" : "Unreachable"} hint={`Round trip ${dbHealth.latencyMs} ms`} icon={<Database aria-hidden />} />
        <StatCard label="Tasks waiting" value={queue.counts.queued} hint={queue.overdueCount ? `${queue.overdueCount} overdue by 10+ minutes` : "None overdue"} href="/admin/system/tasks?status=queued" icon={<Activity aria-hidden />} />
        <StatCard label="Dead tasks" value={queue.counts.dead} hint="Gave up after every retry" href="/admin/system/tasks?status=dead" />
        <StatCard label="Failures (24 hours)" value={queue.failures24h} hint="Failed or dead, created in the last day" href="/admin/system/tasks?status=failed" />
      </StatGrid>

      {!dbHealth.ok ? (
        <Callout tone="danger" title="The database did not respond" live="assertive">
          Most pages will fail until it is reachable. Check DATABASE_URL and the database provider status.
        </Callout>
      ) : null}

      <SectionCard title="Configuration checks" description="Settings and environment presence only; secret values are never read here.">
        {warnings.length ? (
          <ul className="space-y-3" data-testid="config-warnings">
            {warnings.map((w) => (
              <li key={w.title}>
                <Callout tone={TONE[w.level]} title={w.title} action={w.href ? { label: "Review", href: w.href } : undefined}>
                  {w.detail}
                </Callout>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground" data-testid="config-ok">No configuration problems found.</p>
        )}
      </SectionCard>

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title="Versions and runtime" icon={<Server aria-hidden />}>
          <KeyValueList
            items={[
              { label: "Application", value: `Venkat Sai Global ${packageJson.version}` },
              { label: "Environment", value: e.NODE_ENV },
              { label: "Next.js", value: deps.next ?? null },
              { label: "React", value: deps.react ?? null },
              { label: "Node.js", value: process.version },
              { label: "PostgreSQL", value: dbHealth.version },
              { label: "Database size", value: dbHealth.sizeBytes !== null ? formatFileSize(dbHealth.sizeBytes) : null },
              { label: "Server uptime", value: `${Math.round(process.uptime() / 60)} minutes` },
              { label: "Default time zone", value: e.DEFAULT_TIMEZONE },
            ]}
          />
        </SectionCard>
        <SectionCard title="Recurring tasks" description="Last completion of each scheduled task." flush>
          <ul className="divide-y">
            {queue.recurring.map((t) => (
              <li key={t.type} className="flex items-start justify-between gap-3 px-5 py-2.5 text-sm">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{t.description}</span>
                  <code className="text-xs text-muted-foreground">{t.type}</code>
                </span>
                <span className="shrink-0 text-right text-xs text-muted-foreground">
                  {t.lastCompleted ? <RelativeTime value={t.lastCompleted} /> : "Not run yet"}
                  {!t.hasHandler ? <span className="block text-warning-strong">No handler</span> : null}
                </span>
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>
    </div>
  );
}
