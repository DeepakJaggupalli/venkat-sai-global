import type { Metadata } from "next";
import { Inbox, Trash2 } from "lucide-react";
import { z } from "zod";

import { ActionButton } from "@/components/admin/action-button";
import { Callout } from "@/components/shared/callout";
import { DataTable } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { FilterBar, FilterChips, FilterPendingRegion, FilterScope, FilterSelect, SearchInput } from "@/components/shared/filters";
import { PageHeader } from "@/components/shared/page-header";
import { Pagination } from "@/components/shared/pagination";
import { RelativeTime } from "@/components/shared/relative-time";
import { StatusBadge } from "@/components/shared/status-badge";
import { env } from "@/lib/env";
import { parsePage } from "@/lib/http";
import { requireStaff, staffCan } from "@/modules/identity/authz";

import { anyDevTransport } from "../../settings/integrations/_lib/integration-status";
import { clearOutboxAction } from "../actions";
import { SystemNav } from "../_components/system-nav";
import { listOutbox } from "../_lib/system";

export const metadata: Metadata = { title: "Development outbox" };

type SP = Record<string, string | string[] | undefined>;
const channelOptions = [
  { value: "email", label: "E-mail" },
  { value: "sms", label: "SMS" },
  { value: "whatsapp", label: "WhatsApp" },
];

export default async function DevOutboxPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requireStaff("system.dev_outbox");
  const e = env();
  const inUse = anyDevTransport();
  const showSystemNav = staffCan(ctx, "system.jobs");

  if (!inUse) {
    return (
      <div className="space-y-6">
        <PageHeader title="Development outbox" breadcrumbs={[{ label: "Command Centre", href: "/admin" }, { label: "System", href: "/admin/system" }, { label: "Development outbox" }]} />
        {showSystemNav ? <SystemNav showOutbox={false} /> : null}
        <EmptyState icon={<Inbox />} title="Not in use" description="Every message channel uses a real provider, so messages are delivered instead of being stored here." primaryAction={{ label: "View integrations", href: "/admin/settings/integrations" }} />
      </div>
    );
  }

  const sp = await searchParams;
  const channel = z.enum(["email", "sms", "whatsapp"]).optional().catch(undefined).parse(sp.channel);
  const to = z.string().trim().max(200).optional().catch(undefined).parse(typeof sp.to === "string" ? sp.to : undefined);
  const page = parsePage(sp, { defaultSize: 25, maxSize: 100 });
  const result = await listOutbox({ channel, to }, page);
  const devChannels = [e.EMAIL_TRANSPORT === "dev" ? "e-mail" : null, e.SMS_PROVIDER === "dev" ? "SMS" : null, e.WHATSAPP_PROVIDER === "dev" ? "WhatsApp" : null].filter(Boolean);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Development outbox"
        description={`Messages captured instead of sent for: ${devChannels.join(", ")}. Use it to read sign-in codes and check notification wording while testing. Messages older than 30 days are removed automatically.`}
        breadcrumbs={[{ label: "Command Centre", href: "/admin" }, { label: "System", href: "/admin/system" }, { label: "Development outbox" }]}
        actions={
          result.total > 0 ? (
            <ActionButton action={clearOutboxAction.bind(null, {})} icon={<Trash2 aria-hidden className="size-4" />} confirm={{ title: "Remove every captured message?", description: "This cannot be undone.", confirmLabel: "Remove all", destructive: true }}>
              Clear outbox
            </ActionButton>
          ) : null
        }
      />
      {showSystemNav ? <SystemNav showOutbox /> : null}
      {e.NODE_ENV === "production" ? (
        <Callout tone="danger" title="Development transport in production">
          People are not receiving these messages, and this page shows their sign-in codes. Configure real providers before launch.
        </Callout>
      ) : (
        <Callout tone="warning" title="Contains sign-in codes">Treat these messages as confidential, even in testing.</Callout>
      )}

      <FilterScope>
        <FilterBar paramKeys={["channel", "to"]} search={<SearchInput param="to" label="Search by recipient" />}>
          <FilterSelect param="channel" label="Channel" allLabel="All channels" options={channelOptions} />
        </FilterBar>
        <FilterChips filters={[{ param: "channel", label: "Channel", options: channelOptions }, { param: "to", label: "Recipient" }]} />
        <FilterPendingRegion>
          <DataTable
            caption="Captured messages"
            rows={result.items}
            getRowId={(r) => r.id}
            columns={[
              { id: "when", header: "When", nowrap: true, cell: (r) => <RelativeTime value={r.createdAt} /> },
              { id: "channel", header: "Channel", cell: (r) => <StatusBadge tone="neutral" size="sm">{channelOptions.find((c) => c.value === r.channel)?.label ?? r.channel}</StatusBadge> },
              { id: "to", header: "To", cell: (r) => <span className="break-all text-sm">{r.to}</span> },
              {
                id: "message",
                header: "Message",
                primary: true,
                cell: (r) => (
                  <details>
                    <summary className="cursor-pointer text-sm font-medium">{r.subject ?? (r.bodyText ?? "").slice(0, 80) ?? "(no content)"}</summary>
                    <pre className="mt-2 max-h-80 max-w-[min(40rem,80vw)] overflow-auto whitespace-pre-wrap break-words rounded-lg bg-surface-subtle p-3 text-xs">{r.bodyText ?? "(no text body)"}</pre>
                  </details>
                ),
              },
            ]}
            empty={<EmptyState icon={<Inbox />} title="No messages captured" description="Sign in with an e-mail or phone code, or trigger a notification, and it will appear here." />}
            footer={<Pagination pathname="/admin/system/dev-outbox" searchParams={sp} page={result.page} pageCount={result.pageCount} total={result.total} pageSize={result.pageSize} itemLabel="messages" />}
          />
        </FilterPendingRegion>
      </FilterScope>
    </div>
  );
}
