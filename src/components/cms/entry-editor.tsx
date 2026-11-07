"use client";

import { AlertTriangle, CheckCircle2, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Callout } from "@/components/shared/callout";
import { FormField, type FieldControlProps } from "@/components/shared/form";
import { SectionCard } from "@/components/shared/section-card";
import { TagInput } from "@/components/shared/tag-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { CollectionDescriptor } from "@/modules/content/collections";
import { updateEntryAction } from "@/modules/content/actions";
import type { CmsSeo } from "@/modules/content/types";

import { AssetField } from "./asset-field";
import { CmsEditorProvider, useCmsEditor, type EditorOptions } from "./editor-context";
import { EntryPublishPanel } from "./entry-publish-panel";
import { FieldInput } from "./field-input";
import { asEditorFields, countErrorsUnder, errorsAt, type FieldErrors } from "./field-utils";
import { SeoPanel } from "./seo-panel";
import type { EditorCapabilities, EditorContent, EditorEntry } from "./types";

type Snapshot = Omit<EditorContent, "version">;

function snapshotOf(c: EditorContent): Snapshot {
  return { slug: c.slug, title: c.title, summary: c.summary, data: c.data, seo: c.seo, tags: c.tags, heroAssetId: c.heroAssetId };
}

const AUTOSAVE_IDLE_MS = 30_000;

export type SaveOutcome = { ok: true; version: number } | { ok: false };

export type EntryEditorProps = {
  descriptor: CollectionDescriptor;
  entry: EditorEntry;
  latest: EditorContent;
  publicPath: string | null;
  options: EditorOptions;
  can: EditorCapabilities;
  /** Sidebar panels rendered by the page (consent, logo permission, history…). */
  sidebar?: React.ReactNode;
};

/**
 * The ONE generic entry editor: renders any collection from its field descriptors, keeps the whole entry
 * as JSON, autosaves drafts (each save is a version; the live page keeps serving the published version
 * until it is published again) and maps publish validation errors back onto the inputs.
 */
export function EntryEditor({ descriptor, entry, latest, publicPath, options, can, sidebar }: EntryEditorProps) {
  const router = useRouter();
  const fields = useMemo(() => asEditorFields(descriptor.fields), [descriptor.fields]);
  const [content, setContent] = useState<Snapshot>(() => snapshotOf(latest));
  const [baseline, setBaseline] = useState<string>(() => JSON.stringify(snapshotOf(latest)));
  const [baseVersion, setBaseVersion] = useState(latest.version);
  const [formKey, setFormKey] = useState(0);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<{ at: Date; auto: boolean } | null>(null);
  const [autosave, setAutosave] = useState(true);
  const savingRef = useRef(false);
  const readOnly = !can.edit || entry.deleted;

  const dirty = JSON.stringify(content) !== baseline;

  // A newer version arrived from the server (rollback, another editor): adopt it when nothing is unsaved.
  const [staleNotice, setStaleNotice] = useState(false);
  const [seenVersion, setSeenVersion] = useState(latest.version);
  if (latest.version !== seenVersion) {
    // Adjust state while rendering (not in an effect) when new server props arrive.
    setSeenVersion(latest.version);
    if (latest.version !== baseVersion) {
      if (!dirty) {
        setContent(snapshotOf(latest));
        setBaseline(JSON.stringify(snapshotOf(latest)));
        setBaseVersion(latest.version);
        setFormKey((k) => k + 1);
        setStaleNotice(false);
      } else {
        setStaleNotice(true);
      }
    }
  }

  const update = useCallback(<K extends keyof Snapshot>(key: K, value: Snapshot[K]) => setContent((c) => ({ ...c, [key]: value })), []);

  const save = useCallback(
    async (opts: { auto?: boolean; note?: string } = {}): Promise<SaveOutcome> => {
      if (savingRef.current || readOnly) return { ok: false };
      savingRef.current = true;
      setSaving(true);
      const snapshot = content;
      const fd = new FormData();
      fd.set("id", entry.id);
      fd.set("expectedVersion", String(baseVersion));
      fd.set("title", snapshot.title);
      if (!descriptor.singleton && snapshot.slug) fd.set("slug", snapshot.slug);
      if (snapshot.summary) fd.set("summary", snapshot.summary);
      fd.set("data:json", JSON.stringify(snapshot.data));
      fd.set("seo:json", JSON.stringify(snapshot.seo));
      if (snapshot.tags.length === 0) fd.append("tags[]", "");
      snapshot.tags.forEach((t) => fd.append("tags[]", t));
      if (snapshot.heroAssetId) fd.set("heroAssetId", snapshot.heroAssetId);
      const note = opts.note ?? (opts.auto ? "Autosaved draft" : undefined);
      if (note) fd.set("note", note);
      try {
        const result = await updateEntryAction(null, fd);
        if (!result.ok) {
          setErrors(result.fieldErrors ?? {});
          setFormError(result.error);
          if (opts.auto) setAutosave(false);
          return { ok: false };
        }
        setErrors({});
        setFormError(null);
        setBaseline(JSON.stringify(snapshot));
        const version = result.data?.version ?? baseVersion;
        setBaseVersion(version);
        setLastSaved({ at: new Date(), auto: Boolean(opts.auto) });
        if (!opts.auto && result.message) toast.success(result.message);
        router.refresh();
        return { ok: true, version };
      } finally {
        savingRef.current = false;
        setSaving(false);
      }
    },
    [content, baseVersion, entry.id, descriptor.singleton, readOnly, router],
  );

  // Autosave after a pause in editing.
  useEffect(() => {
    if (!dirty || !autosave || readOnly || staleNotice) return;
    const t = setTimeout(() => void save({ auto: true }), AUTOSAVE_IDLE_MS);
    return () => clearTimeout(t);
  }, [content, dirty, autosave, readOnly, staleNotice, save]);

  // Ctrl/Cmd+S saves; warn before leaving with unsaved changes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (dirty) void save();
      }
    };
    const onUnload = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("beforeunload", onUnload);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("beforeunload", onUnload);
    };
  }, [dirty, save]);

  /** Save pending changes first (publish / preview / schedule act on the latest saved version). */
  const ensureSaved = useCallback(async (): Promise<number | null> => {
    if (!dirty) return baseVersion;
    const r = await save();
    return r.ok ? r.version : null;
  }, [dirty, baseVersion, save]);

  const dataErrorCount = countErrorsUnder(errors, "data");
  const totalErrors = Object.values(errors).reduce((n, v) => n + (v?.length ?? 0), 0);

  return (
    <CmsEditorProvider options={options} errors={errors} disabled={readOnly}>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_22rem]">
        <form
          key={formKey}
          noValidate
          className="min-w-0 space-y-6"
          onSubmit={(e) => {
            // Forms inside dialogs (media upload, video link) are portalled but their submit events still bubble
            // through the React tree: only handle this form's own submission.
            if (e.target !== e.currentTarget) return;
            e.preventDefault();
            void save();
          }}
          aria-label={`Edit ${descriptor.singularLabel.toLowerCase()}`}
        >
          {/* Save status bar */}
          <div className="sticky top-14 z-20 -mx-1 flex flex-wrap items-center gap-3 rounded-xl border bg-card/95 px-4 py-3 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-card/80" role="region" aria-label="Save status">
            <p className="flex min-w-0 items-center gap-2 text-sm" aria-live="polite">
              {saving ? (
                <span className="text-muted-foreground">Saving…</span>
              ) : dirty ? (
                <>
                  <AlertTriangle className="size-4 shrink-0 text-warning" aria-hidden />
                  <span>Unsaved changes{autosave && !readOnly ? " · saves automatically after 30 seconds" : ""}</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden />
                  <span>
                    All changes saved · version {baseVersion}
                    {lastSaved ? ` · ${lastSaved.auto ? "autosaved" : "saved"} at ${lastSaved.at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}
                  </span>
                </>
              )}
            </p>
            {!readOnly && (
              <div className="ml-auto flex items-center gap-3">
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <input type="checkbox" className="size-4 accent-[var(--color-teal)]" checked={autosave} onChange={(e) => setAutosave(e.target.checked)} />
                  Autosave
                </label>
                <Button type="submit" size="sm" disabled={!dirty || saving} aria-keyshortcuts="Control+S">
                  <Save aria-hidden />
                  {saving ? "Saving…" : "Save draft"}
                </Button>
              </div>
            )}
          </div>

          {readOnly && (
            <Callout tone="neutral" title={entry.deleted ? "This entry is in the bin" : "View only"}>
              {entry.deleted ? "Restore it to edit or publish again." : "You can view this entry but your role cannot edit content."}
            </Callout>
          )}
          {staleNotice && (
            <Callout tone="warning" title="A newer version was saved" live="polite">
              Someone (or a restore) saved version {latest.version} while you were editing. Saving now will be refused to protect their changes.{" "}
              <Button
                type="button"
                variant="link"
                className="h-auto p-0"
                onClick={() => {
                  setContent(snapshotOf(latest));
                  setBaseline(JSON.stringify(snapshotOf(latest)));
                  setBaseVersion(latest.version);
                  setFormKey((k) => k + 1);
                  setStaleNotice(false);
                }}
              >
                Discard my changes and load version {latest.version}
              </Button>
            </Callout>
          )}
          {formError && totalErrors > 0 && (
            <Callout tone="danger" title={formError} live="assertive">
              {totalErrors === 1 ? "1 field needs attention." : `${totalErrors} fields need attention.`} Fields marked * are required before publishing; drafts can be saved incomplete.
            </Callout>
          )}
          {formError && totalErrors === 0 && (
            <Callout tone="danger" live="assertive">
              {formError}
            </Callout>
          )}

          <SectionCard title="Basics" description={descriptor.singleton ? "The internal name of this page in the Command Centre." : "Title, web address and short summary."}>
            <div className="space-y-4">
              <FormField label="Title" required errors={errorsAt(errors, "title")}>
                <Input value={content.title} maxLength={200} disabled={readOnly} onChange={(e) => update("title", e.target.value)} />
              </FormField>
              {!descriptor.singleton && (
                <FormField
                  label="Web address (slug)"
                  errors={errorsAt(errors, "slug")}
                  hint={
                    descriptor.publicPathPattern
                      ? `Public page: ${descriptor.publicPathPattern.replace("<slug>", content.slug || "…")}. Lower-case letters, numbers and hyphens. Changing it changes the link.`
                      : "Lower-case letters, numbers and hyphens."
                  }
                >
                  <Input value={content.slug} maxLength={200} disabled={readOnly} spellCheck={false} autoCapitalize="none" onChange={(e) => update("slug", e.target.value.toLowerCase())} />
                </FormField>
              )}
              {!descriptor.singleton && (
                <FormField label="Summary" optional errors={errorsAt(errors, "summary")} hint="One or two sentences used on listing cards and in search results.">
                  <Textarea rows={3} maxLength={600} value={content.summary ?? ""} disabled={readOnly} onChange={(e) => update("summary", e.target.value || null)} />
                </FormField>
              )}
              {descriptor.usesHero && (
                <FormField label="Hero image" optional errors={errorsAt(errors, "heroAssetId")} hint="Shown at the top of the page and on listing cards. Must be public in the media library.">
                  {(control) => <ContextAssetField control={control} label="Hero image" value={content.heroAssetId} onChange={(v) => update("heroAssetId", v)} />}
                </FormField>
              )}
            </div>
          </SectionCard>

          {fields.length > 0 && (
            <SectionCard
              title={`${descriptor.singularLabel} content`}
              description={dataErrorCount > 0 ? `${dataErrorCount} ${dataErrorCount === 1 ? "field needs" : "fields need"} attention.` : "Fields marked * are required before publishing."}
            >
              <div className="space-y-5">
                {fields.map((f) => (
                  <FieldInput
                    key={f.name}
                    field={f}
                    value={content.data[f.name]}
                    path={[f.name]}
                    onChange={(v) =>
                      setContent((c) => {
                        const data = { ...c.data };
                        if (v === undefined) delete data[f.name];
                        else data[f.name] = v;
                        return { ...c, data };
                      })
                    }
                  />
                ))}
              </div>
            </SectionCard>
          )}

          {!descriptor.singleton || descriptor.key === "about" ? (
            <SeoPanel
              seo={content.seo}
              onChange={(seo: CmsSeo) => update("seo", seo)}
              errors={errors}
              fallbackTitle={content.title}
              fallbackDescription={content.summary}
              publicPath={publicPath ?? descriptor.publicPathPattern?.replace("<slug>", content.slug) ?? null}
            />
          ) : null}

          {!descriptor.singleton && (
            <SectionCard title="Tags" description="Used for filtering and related content. Press Enter after each tag.">
              <FormField label="Tags" hideLabel errors={errorsAt(errors, "tags")}>
                <TagInput value={content.tags} onChange={(t) => update("tags", t)} maxTags={20} maxLength={40} lowercase disabled={readOnly} />
              </FormField>
            </SectionCard>
          )}
        </form>

        <aside className="min-w-0 space-y-6" aria-label="Publishing and history">
          <EntryPublishPanel descriptor={descriptor} entry={entry} publicPath={publicPath} can={can} dirty={dirty} saving={saving} ensureSaved={ensureSaved} onErrors={(fe, msg) => { setErrors(fe); setFormError(msg); }} />
          {sidebar}
        </aside>
      </div>
    </CmsEditorProvider>
  );
}

/** Single image picker wired to the editor context (shares the asset cache with the data fields). */
function ContextAssetField({ control, label, value, onChange }: { control: FieldControlProps; label: string; value: string | null; onChange: (v: string | null) => void }) {
  const editor = useCmsEditor();
  return (
    <AssetField
      id={control.id}
      aria-describedby={control["aria-describedby"]}
      aria-invalid={control["aria-invalid"]}
      label={label}
      kinds={["image"]}
      value={value}
      onChange={(v) => onChange(typeof v === "string" ? v : null)}
      assets={editor.assets}
      rememberAssets={editor.rememberAssets}
      canUpload={editor.canUpload}
      disabled={editor.disabled}
    />
  );
}
