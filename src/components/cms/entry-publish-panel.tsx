"use client";

import { Archive, CalendarClock, Copy, ExternalLink, Eye, EyeOff, RotateCcw, Send, Star, Trash2, UploadCloud } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { DateText } from "@/components/shared/date-text";
import { ResponsiveDialog } from "@/components/shared/responsive-dialog";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { CollectionDescriptor } from "@/modules/content/collections";
import {
  archiveEntryAction,
  createPreviewLinkAction,
  deleteEntryAction,
  duplicateEntryAction,
  publishEntryAction,
  requestPublicationAction,
  restoreEntryAction,
  scheduleEntryAction,
  setEntryFeaturedAction,
  unpublishEntryAction,
} from "@/modules/content/actions";
import { CMS_ENTRY_STATUS_LABELS, CONTENT_LOCALE_LABELS, CONTENT_LOCALE_VALUES } from "@/modules/content/constants";
import { CONTENT_ADMIN_PATHS } from "@/modules/content/links";

import { fromDatetimeLocal, toDatetimeLocal, type FieldErrors } from "./field-utils";
import type { EditorCapabilities, EditorEntry } from "./types";

const STATUS_TONE = { draft: "neutral", scheduled: "brand", published: "success", archived: "warning" } as const;
/** Singletons that are always on the site (cannot be taken offline). */
const ALWAYS_ON = new Set(["site_settings", "homepage", "navigation"]);

type Props = {
  descriptor: CollectionDescriptor;
  entry: EditorEntry;
  publicPath: string | null;
  can: EditorCapabilities;
  dirty: boolean;
  saving: boolean;
  ensureSaved: () => Promise<number | null>;
  onErrors: (fieldErrors: FieldErrors, message: string | null) => void;
};

export function EntryPublishPanel({ descriptor, entry, publicPath, can, dirty, saving, ensureSaved, onErrors }: Props) {
  const router = useRouter();
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const [pending, startTransition] = useTransition();
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);
  const busy = pending || saving;
  const viaApproval = Boolean(descriptor.approvalType);
  const hasUnpublished = entry.publishedVersion !== null && entry.currentVersion > entry.publishedVersion;
  const isLive = entry.status === "published";

  function run<T>(fn: () => Promise<{ ok: boolean; message?: string; error?: string; fieldErrors?: FieldErrors; data?: T }>, after?: (data: T | undefined) => void) {
    startTransition(async () => {
      const result = await fn();
      if (result.ok) {
        onErrors({}, null);
        if (result.message) toast.success(result.message);
        after?.(result.data);
        router.refresh();
      } else {
        onErrors(result.fieldErrors ?? {}, result.error ?? "Something went wrong.");
        toast.error(result.error ?? "Something went wrong.");
      }
    });
  }

  function publish() {
    startTransition(async () => {
      const version = await ensureSaved();
      if (version === null) return;
      const result = await publishEntryAction({ id: entry.id, version });
      if (result.ok) {
        onErrors({}, null);
        toast.success(result.message ?? "Published.");
        router.refresh();
      } else {
        onErrors(result.fieldErrors ?? {}, result.error);
        toast.error(result.error);
      }
    });
  }

  async function preview() {
    // Open the tab synchronously (popup blockers), then point it at the signed preview URL.
    const tab = window.open("about:blank", "_blank");
    const version = await ensureSaved();
    if (version === null) {
      tab?.close();
      return;
    }
    const result = await createPreviewLinkAction({ id: entry.id, version: "latest" });
    if (result.ok && result.data?.url) {
      if (tab) {
        tab.opener = null;
        tab.location.href = result.data.url;
      } else {
        window.open(result.data.url, "_blank", "noopener");
      }
    } else {
      tab?.close();
      toast.error(result.ok ? "This content has no public page to preview." : result.error);
    }
  }

  return (
    <SectionCard title="Publishing" headingLevel="h2">
      <div className="space-y-4">
        <dl className="space-y-2 text-sm">
          <div className="flex items-center justify-between gap-2">
            <dt className="text-muted-foreground">Status</dt>
            <dd className="flex flex-wrap justify-end gap-1">
              {entry.deleted ? <StatusBadge tone="danger" size="sm">In the bin</StatusBadge> : <StatusBadge tone={STATUS_TONE[entry.status]} size="sm">{CMS_ENTRY_STATUS_LABELS[entry.status]}</StatusBadge>}
              {entry.isFeatured && <StatusBadge tone="gold" size="sm">Featured</StatusBadge>}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="text-muted-foreground">Live version</dt>
            <dd>{entry.publishedVersion ? `Version ${entry.publishedVersion}` : "Never published"}</dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="text-muted-foreground">Latest saved</dt>
            <dd>Version {entry.currentVersion}</dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="text-muted-foreground">Language</dt>
            <dd>{CONTENT_LOCALE_LABELS[entry.locale as keyof typeof CONTENT_LOCALE_LABELS] ?? entry.locale}</dd>
          </div>
          {entry.publishAt && entry.scheduledVersion && (
            <div className="flex items-center justify-between gap-2">
              <dt className="text-muted-foreground">Publishes</dt>
              <dd className="text-right">
                <DateText value={entry.publishAt} mode="datetime" /> (v{entry.scheduledVersion})
              </dd>
            </div>
          )}
          {entry.unpublishAt && (
            <div className="flex items-center justify-between gap-2">
              <dt className="text-muted-foreground">Goes offline</dt>
              <dd className="text-right">
                <DateText value={entry.unpublishAt} mode="datetime" />
              </dd>
            </div>
          )}
        </dl>

        {hasUnpublished && isLive && (
          <p className="rounded-md bg-warning-soft px-3 py-2 text-sm text-warning-strong">The live page shows version {entry.publishedVersion}. Publish to make your latest changes live.</p>
        )}
        {dirty && <p className="text-xs text-muted-foreground">Unsaved changes are saved first when you publish, schedule or preview.</p>}
        {viaApproval && (
          <p className="rounded-md bg-info-soft px-3 py-2 text-sm text-info">
            {descriptor.label} are checked by a second person: publishing sends the version to the approval centre with its consent evidence.
          </p>
        )}

        {entry.deleted ? (
          can.edit && (
            <Button type="button" className="w-full" disabled={busy} onClick={() => run(() => restoreEntryAction({ id: entry.id }))}>
              <RotateCcw aria-hidden />
              Restore from the bin
            </Button>
          )
        ) : (
          <div className="flex flex-col gap-2">
            {can.publish ? (
              <Button type="button" className="w-full" disabled={busy || entry.status === "archived"} onClick={publish}>
                {viaApproval ? <Send aria-hidden /> : <UploadCloud aria-hidden />}
                {viaApproval ? "Submit for approval" : isLive ? (dirty || hasUnpublished ? "Publish changes" : "Republish") : "Publish"}
              </Button>
            ) : (
              can.edit && (
                <Button type="button" className="w-full" disabled={busy || entry.status === "archived"} onClick={() => setRequestOpen(true)}>
                  <Send aria-hidden />
                  Request publication
                </Button>
              )
            )}
            {publicPath && (
              <Button type="button" variant="outline" className="w-full" disabled={busy} onClick={() => void preview()}>
                <Eye aria-hidden />
                Preview latest version
                <span className="sr-only"> (opens in a new tab)</span>
              </Button>
            )}
            {isLive && publicPath && (
              <Button asChild variant="ghost" className="w-full">
                <a href={publicPath} target="_blank" rel="noopener noreferrer">
                  <ExternalLink aria-hidden />
                  View live page<span className="sr-only"> (opens in a new tab)</span>
                </a>
              </Button>
            )}
            {can.publish && entry.status !== "archived" && (
              <Button type="button" variant="outline" className="w-full" disabled={busy} onClick={() => setScheduleOpen(true)}>
                <CalendarClock aria-hidden />
                {entry.publishAt || entry.unpublishAt ? "Change schedule" : "Schedule"}
              </Button>
            )}
          </div>
        )}

        {!entry.deleted && (can.edit || can.publish) && (
          <div className="flex flex-wrap gap-1 border-t pt-3">
            {can.publish && !descriptor.singleton && entry.status !== "archived" && (
              <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => run(() => setEntryFeaturedAction({ id: entry.id, featured: !entry.isFeatured }))}>
                <Star aria-hidden />
                {entry.isFeatured ? "Unfeature" : "Feature"}
              </Button>
            )}
            {can.publish && isLive && !ALWAYS_ON.has(entry.collection) && (
              <ReasonConfirm
                label="Unpublish"
                icon={<EyeOff aria-hidden />}
                title="Take this page offline?"
                description="It becomes a draft and disappears from the website. You can publish it again later."
                confirmLabel="Unpublish"
                onConfirm={(reason) => unpublishEntryAction({ id: entry.id, reason })}
              />
            )}
            {can.publish && entry.status !== "archived" && !ALWAYS_ON.has(entry.collection) && (
              <ReasonConfirm
                label="Archive"
                icon={<Archive aria-hidden />}
                title="Archive this entry?"
                description="It is removed from the website and from the active list. You can restore it from the archive."
                confirmLabel="Archive"
                onConfirm={(reason) => archiveEntryAction({ id: entry.id, reason })}
              />
            )}
            {can.edit && entry.status === "archived" && (
              <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => run(() => restoreEntryAction({ id: entry.id }))}>
                <RotateCcw aria-hidden />
                Restore as draft
              </Button>
            )}
            {can.edit && <DuplicateButton entryId={entry.id} collection={entry.collection} singleton={descriptor.singleton} currentLocale={entry.locale} />}
            {can.edit && !descriptor.singleton && (entry.publishedVersion === null || can.publish) && (
              <ConfirmDialog
                trigger={
                  <Button type="button" variant="ghost" size="sm" className="text-danger-strong hover:text-danger-strong">
                    <Trash2 aria-hidden />
                    Move to bin
                  </Button>
                }
                title="Move this entry to the bin?"
                description={isLive ? "It is taken off the website immediately. You can restore it from the bin." : "You can restore it from the bin."}
                confirmLabel="Move to bin"
                variant="destructive"
                onConfirm={() => deleteEntryAction({ id: entry.id })}
                onSuccess={() => router.push(CONTENT_ADMIN_PATHS.collection(entry.collection))}
              />
            )}
          </div>
        )}
      </div>

      <ScheduleDialog
        open={scheduleOpen}
        onOpenChange={setScheduleOpen}
        entry={entry}
        viaApproval={viaApproval}
        ensureSaved={ensureSaved}
        onDone={(fe, msg) => onErrors(fe, msg)}
        uid={uid}
      />
      <RequestDialog open={requestOpen} onOpenChange={setRequestOpen} entryId={entry.id} ensureSaved={ensureSaved} onErrors={onErrors} uid={uid} />
    </SectionCard>
  );
}

function ReasonConfirm({
  label,
  icon,
  title,
  description,
  confirmLabel,
  onConfirm,
}: {
  label: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: (reason: string | undefined) => Promise<unknown>;
}) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  return (
    <ConfirmDialog
      trigger={
        <Button type="button" variant="ghost" size="sm">
          {icon}
          {label}
        </Button>
      }
      title={title}
      description={description}
      confirmLabel={confirmLabel}
      onConfirm={(fd) => onConfirm(String(fd.get("reason") ?? "").trim() || undefined)}
    >
      <div className="space-y-1.5">
        <Label htmlFor={`reason-${id}`}>Reason (optional, kept in the audit log)</Label>
        <Textarea id={`reason-${id}`} name="reason" rows={2} maxLength={500} />
      </div>
    </ConfirmDialog>
  );
}

function DuplicateButton({ entryId, collection, singleton, currentLocale }: { entryId: string; collection: string; singleton: boolean; currentLocale: string }) {
  const router = useRouter();
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const locales = CONTENT_LOCALE_VALUES.filter((l) => !singleton || l !== currentLocale);
  return (
    <ConfirmDialog
      trigger={
        <Button type="button" variant="ghost" size="sm">
          <Copy aria-hidden />
          {singleton ? "Copy to another language" : "Duplicate"}
        </Button>
      }
      title={singleton ? "Copy to another language" : "Duplicate this entry"}
      description="The copy is created as a draft. Consent and logo permissions are never copied."
      confirmLabel="Create copy"
      onConfirm={async (fd) => {
        const result = await duplicateEntryAction({
          id: entryId,
          title: String(fd.get("title") ?? "").trim() || undefined,
          locale: (String(fd.get("locale") ?? "") || undefined) as (typeof CONTENT_LOCALE_VALUES)[number] | undefined,
        });
        if (result.ok && result.data) router.push(CONTENT_ADMIN_PATHS.entry(collection as Parameters<typeof CONTENT_ADMIN_PATHS.entry>[0], result.data.id));
        return result;
      }}
    >
      <div className="space-y-3">
        {!singleton && (
          <div className="space-y-1.5">
            <Label htmlFor={`dup-title-${id}`}>Title of the copy (optional)</Label>
            <Input id={`dup-title-${id}`} name="title" maxLength={200} />
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor={`dup-locale-${id}`}>Language</Label>
          <select id={`dup-locale-${id}`} name="locale" defaultValue={singleton ? locales[0] : currentLocale} className="h-9 w-full rounded-md border bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
            {locales.map((l) => (
              <option key={l} value={l}>
                {CONTENT_LOCALE_LABELS[l]}
              </option>
            ))}
          </select>
        </div>
      </div>
    </ConfirmDialog>
  );
}

function ScheduleDialog({
  open,
  onOpenChange,
  entry,
  viaApproval,
  ensureSaved,
  onDone,
  uid,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  entry: EditorEntry;
  viaApproval: boolean;
  ensureSaved: () => Promise<number | null>;
  onDone: (fe: FieldErrors, msg: string | null) => void;
  uid: string;
}) {
  const router = useRouter();
  const [publishAt, setPublishAt] = useState(toDatetimeLocal(entry.scheduledVersion ? entry.publishAt : null));
  const [unpublishAt, setUnpublishAt] = useState(toDatetimeLocal(entry.unpublishAt));
  const [error, setError] = useState<{ publishAt?: string; unpublishAt?: string; form?: string }>({});
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const version = publishAt ? await ensureSaved() : entry.currentVersion;
      if (version === null) return;
      const result = await scheduleEntryAction({
        id: entry.id,
        version: publishAt ? version : undefined,
        publishAt: publishAt ? fromDatetimeLocal(publishAt) : entry.scheduledVersion ? null : undefined,
        unpublishAt: unpublishAt ? fromDatetimeLocal(unpublishAt) : entry.unpublishAt ? null : undefined,
      });
      if (result.ok) {
        toast.success(result.message ?? "Schedule saved.");
        onDone({}, null);
        onOpenChange(false);
        router.refresh();
      } else {
        const fe = result.fieldErrors ?? {};
        setError({ publishAt: fe.publishAt?.[0], unpublishAt: fe.unpublishAt?.[0], form: result.error });
        onDone(fe, result.error);
      }
    });
  }

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange} title="Schedule" description="Times are in your local time zone. The latest saved version is pinned, so later edits are not published unreviewed.">
      <form onSubmit={submit} noValidate className="space-y-4">
        {error.form && (
          <p className="text-sm text-danger-strong" role="alert">
            {error.form}
          </p>
        )}
        <div className="space-y-1.5">
          <Label htmlFor={`${uid}-pub`}>Publish on</Label>
          <Input id={`${uid}-pub`} type="datetime-local" value={publishAt} onChange={(e) => setPublishAt(e.target.value)} aria-invalid={error.publishAt ? true : undefined} aria-describedby={error.publishAt ? `${uid}-pub-err` : `${uid}-pub-hint`} />
          <p id={`${uid}-pub-hint`} className="text-xs text-muted-foreground">
            {viaApproval ? "The scheduled version goes to the approval centre first." : "Leave empty to clear a scheduled publication."}
          </p>
          {error.publishAt && (
            <p id={`${uid}-pub-err`} className="text-sm text-danger-strong">
              {error.publishAt}
            </p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${uid}-unpub`}>Take offline on (optional)</Label>
          <Input id={`${uid}-unpub`} type="datetime-local" value={unpublishAt} onChange={(e) => setUnpublishAt(e.target.value)} aria-invalid={error.unpublishAt ? true : undefined} aria-describedby={error.unpublishAt ? `${uid}-unpub-err` : `${uid}-unpub-hint`} />
          <p id={`${uid}-unpub-hint`} className="text-xs text-muted-foreground">
            The entry is archived automatically, for example after an event or a time-limited offer.
          </p>
          {error.unpublishAt && (
            <p id={`${uid}-unpub-err`} className="text-sm text-danger-strong">
              {error.unpublishAt}
            </p>
          )}
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending || (!publishAt && !unpublishAt && !entry.scheduledVersion && !entry.unpublishAt)}>
            {pending ? "Saving…" : "Save schedule"}
          </Button>
        </div>
      </form>
    </ResponsiveDialog>
  );
}

function RequestDialog({
  open,
  onOpenChange,
  entryId,
  ensureSaved,
  onErrors,
  uid,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  entryId: string;
  ensureSaved: () => Promise<number | null>;
  onErrors: (fe: FieldErrors, msg: string | null) => void;
  uid: string;
}) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [publishAt, setPublishAt] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const version = await ensureSaved();
      if (version === null) return;
      const result = await requestPublicationAction({ id: entryId, version, note: note.trim() || undefined, publishAt: publishAt ? fromDatetimeLocal(publishAt) : undefined });
      if (result.ok) {
        toast.success(result.message ?? "Sent for approval.");
        onErrors({}, null);
        onOpenChange(false);
        router.refresh();
      } else {
        setError(result.error);
        onErrors(result.fieldErrors ?? {}, result.error);
      }
    });
  }

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange} title="Request publication" description="A publisher reviews the latest saved version in the approval centre.">
      <form onSubmit={submit} noValidate className="space-y-4">
        {error && (
          <p className="text-sm text-danger-strong" role="alert">
            {error}
          </p>
        )}
        <div className="space-y-1.5">
          <Label htmlFor={`${uid}-note`}>Note for the reviewer (optional)</Label>
          <Textarea id={`${uid}-note`} rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${uid}-when`}>Publish on (optional)</Label>
          <Input id={`${uid}-when`} type="datetime-local" value={publishAt} onChange={(e) => setPublishAt(e.target.value)} />
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Sending…" : "Send for approval"}
          </Button>
        </div>
      </form>
    </ResponsiveDialog>
  );
}
