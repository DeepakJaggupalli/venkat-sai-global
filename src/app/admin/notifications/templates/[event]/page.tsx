import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PortalBreadcrumb } from "@/components/layout/portal-breadcrumb";
import { DataTable } from "@/components/shared/data-table";
import { DateText } from "@/components/shared/date-text";
import { LinkTabs } from "@/components/shared/link-tabs";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { LOCALE_LABELS, LOCALES } from "@/i18n/config";
import { env } from "@/lib/env";
import { sp, type SearchParams } from "@/lib/http";
import { requireStaff } from "@/modules/identity/authz";
import { CATEGORY_LABELS, CHANNEL_LABELS, NOTIFICATION_CHANNEL_KEYS } from "@/modules/notifications/catalog";
import { isNotificationEvent } from "@/modules/notifications/channels";
import { getNotificationTemplate, listNotificationTemplates } from "@/modules/notifications/queries";

import { TemplateEditor } from "../../_components/template-editor";

export const metadata: Metadata = { title: "Edit notification template" };

export default async function TemplateEditorPage({ params, searchParams }: { params: Promise<{ event: string }>; searchParams: Promise<SearchParams> }) {
  const ctx = await requireStaff("notifications.templates");
  const { event: raw } = await params;
  const eventKey = decodeURIComponent(raw);
  if (!isNotificationEvent(eventKey)) notFound();
  const query = await searchParams;
  const catalog = await listNotificationTemplates(ctx, { q: eventKey });
  const item = catalog.find((c) => c.eventKey === eventKey);
  if (!item) notFound();

  const requestedChannel = sp(query, "channel");
  const channel = NOTIFICATION_CHANNEL_KEYS.find((c) => c === requestedChannel) ?? item.defaultChannels.find((c) => c === "email") ?? item.defaultChannels[0] ?? "email";
  const requestedLocale = sp(query, "locale");
  const locale = LOCALES.find((l) => l === requestedLocale) ?? "en";
  const summary = item.overrides.find((o) => o.channel === channel && o.locale === locale) ?? null;
  const row = summary ? await getNotificationTemplate(ctx, summary.id) : null;
  const base = `/admin/notifications/templates/${encodeURIComponent(eventKey)}`;
  const href = (c: string, l: string) => `${base}?channel=${c}&locale=${l}`;
  const fallback = {
    subject: item.defaults.subject,
    body: channel === "sms" ? (item.defaults.sms ?? item.defaults.subject) : channel === "whatsapp" ? item.placeholders.map((p) => `{{${p}}}`).join("\n") : item.defaults.body,
  };
  const timeZone = ctx.user.timezone ?? env().DEFAULT_TIMEZONE;

  return (
    <div className="space-y-6">
      <PortalBreadcrumb items={[{ label: "Notifications", href: "/admin/notifications" }, { label: item.label }]} />
      <PageHeader
        eyebrow={`${CATEGORY_LABELS[item.category].label} · ${eventKey}`}
        title={item.label}
        description={`Sent by default on: ${item.defaultChannels.map((c) => CHANNEL_LABELS[c]).join(", ")}.${item.mandatory ? " This message is always sent (people cannot opt out)." : ""}`}
        backLink={{ href: "/admin/notifications", label: "Back to templates" }}
      />
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <LinkTabs label="Channel" items={NOTIFICATION_CHANNEL_KEYS.map((c) => ({ href: href(c, locale), label: CHANNEL_LABELS[c] }))} activeHref={href(channel, locale)} />
        <LinkTabs label="Language" items={LOCALES.map((l) => ({ href: href(channel, l), label: LOCALE_LABELS[l].english }))} activeHref={href(channel, locale)} />
      </div>
      <SectionCard
        title={`${CHANNEL_LABELS[channel]} · ${LOCALE_LABELS[locale].english}`}
        description={row ? `Custom template, version ${row.version}${row.isActive ? "" : " (inactive — the default is used)"}.` : locale === "en" ? "Using the built-in default wording." : "No template in this language yet: the English template is used."}
        headingLevel="h2"
      >
        <TemplateEditor
          key={`${channel}-${locale}-${row?.version ?? 0}`}
          eventKey={eventKey}
          channel={channel}
          locale={locale}
          placeholders={item.placeholders}
          override={
            row
              ? { id: row.id, subject: row.subject, body: row.body, whatsappTemplateName: row.whatsappTemplateName, whatsappLanguageCode: row.whatsappLanguageCode, smsTemplateId: row.smsTemplateId, isActive: row.isActive, version: row.version }
              : null
          }
          fallback={fallback}
        />
      </SectionCard>
      <SectionCard title="Saved templates for this event" headingLevel="h2" flush>
        <DataTable
          caption="Saved templates"
          rows={item.overrides}
          getRowId={(o) => o.id}
          rowLink={(o) => ({ href: href(o.channel, o.locale), label: `Edit ${CHANNEL_LABELS[o.channel]} ${o.locale}` })}
          columns={[
            { id: "channel", header: "Channel", primary: true, cell: (o) => CHANNEL_LABELS[o.channel] },
            { id: "locale", header: "Language", cell: (o) => LOCALE_LABELS[o.locale as keyof typeof LOCALE_LABELS]?.english ?? o.locale },
            { id: "version", header: "Version", align: "right", cell: (o) => o.version },
            { id: "state", header: "State", cell: (o) => <StatusBadge tone={o.isActive ? "success" : "neutral"} size="sm">{o.isActive ? "Active" : "Inactive"}</StatusBadge> },
            { id: "updated", header: "Updated", hideOnMobile: true, cell: (o) => <span><DateText value={o.updatedAt} mode="datetime" timeZone={timeZone} />{o.updatedByName ? ` by ${o.updatedByName}` : ""}</span> },
          ]}
          empty={<p className="px-5 py-4 text-sm text-muted-foreground">No custom templates yet. Every channel uses the default wording.</p>}
        />
      </SectionCard>
    </div>
  );
}
