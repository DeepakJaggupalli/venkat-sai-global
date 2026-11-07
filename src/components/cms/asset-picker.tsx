"use client";

import { FileText, ImageIcon, PlayCircle, Search, ShieldAlert, Video } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState, useTransition } from "react";

import { ResponsiveDialog } from "@/components/shared/responsive-dialog";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { MediaKind } from "@/db/schema";
import { getPickerAssetsAction, searchMediaForPickerAction } from "@/app/admin/media/_lib/picker-actions";
import type { PickerAsset } from "@/app/admin/media/_lib/picker-types";
import { MEDIA_KIND_LABELS } from "@/modules/content/constants";
import { cn } from "@/lib/utils";

import { EmbedForm } from "./embed-form";
import { MediaUploader } from "./media-uploader";

export function AssetThumb({ asset, className }: { asset: PickerAsset | undefined; className?: string }) {
  const box = cn("flex aspect-video w-full items-center justify-center overflow-hidden rounded-md bg-surface-subtle text-muted-foreground", className);
  if (!asset) return <div className={box}><ImageIcon className="size-6" aria-hidden /></div>;
  if (asset.kind === "image" && (asset.thumbnailUrl || asset.url)) {
    // eslint-disable-next-line @next/next/no-img-element -- library thumbnails come from the files module (sized variants)
    return <img src={asset.thumbnailUrl ?? asset.url ?? ""} alt="" className={cn(box, "object-cover")} loading="lazy" />;
  }
  const Icon = asset.kind === "embed" ? PlayCircle : asset.kind === "video" ? Video : FileText;
  return <div className={box}><Icon className="size-6" aria-hidden /></div>;
}

export function AssetFlags({ asset }: { asset: PickerAsset }) {
  return (
    <span className="flex flex-wrap gap-1">
      {asset.visibility === "internal" && <StatusBadge tone="neutral" size="sm">Internal</StatusBadge>}
      {asset.showsIdentifiablePeople && asset.consentStatus !== "obtained" && (
        <StatusBadge tone="warning" size="sm" icon={<ShieldAlert className="size-3" aria-hidden />}>
          Consent needed
        </StatusBadge>
      )}
      {asset.kind === "image" && asset.altText === null && <StatusBadge tone="warning" size="sm">No alt text</StatusBadge>}
    </span>
  );
}

export type AssetPickerDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kinds?: readonly MediaKind[];
  multiple?: boolean;
  maxItems?: number;
  selectedIds: string[];
  onConfirm: (assets: PickerAsset[]) => void;
  canUpload: boolean;
  title?: string;
};

/**
 * Choose media from the library, upload new files or add a YouTube/Vimeo link. Items are listed as
 * toggle buttons (aria-pressed) in a grid; only items that are public may appear on the live site, so
 * internal items are flagged (publishing re-checks this).
 */
export function AssetPickerDialog({ open, onOpenChange, kinds, multiple = false, maxItems, selectedIds, onConfirm, canUpload, title }: AssetPickerDialogProps) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const allowed = useMemo<MediaKind[]>(() => (kinds && kinds.length ? [...kinds] : ["image", "video", "document", "embed"]), [kinds]);
  const [kind, setKind] = useState<MediaKind | "">(allowed.length === 1 ? allowed[0]! : allowed.includes("image") ? "image" : "");
  const [q, setQ] = useState("");
  const [items, setItems] = useState<PickerAsset[]>([]);
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<PickerAsset[]>([]);
  const [tab, setTab] = useState("library");
  const [pending, startTransition] = useTransition();
  const requestId = useRef(0);

  const load = useCallback(
    (opts: { page: number; append: boolean; q: string; kind: MediaKind | "" }) => {
      const id = ++requestId.current;
      startTransition(async () => {
        const result = await searchMediaForPickerAction({ q: opts.q || undefined, kind: opts.kind || undefined, page: opts.page });
        if (id !== requestId.current) return;
        if (!result.ok || !result.data) {
          setError(result.ok ? "The media library could not be loaded." : result.error);
          return;
        }
        setError(null);
        const data = result.data;
        const filtered = data.items.filter((a) => allowed.includes(a.kind));
        setItems((prev) => (opts.append ? [...prev, ...filtered] : filtered));
        setPage(data.page);
        setPageCount(data.pageCount);
        setTotal(data.total);
      });
    },
    [allowed],
  );

  // The dialog is mounted per opening (fresh state): load the current selection once.
  useEffect(() => {
    if (selectedIds.length === 0) return;
    void getPickerAssetsAction({ ids: selectedIds.slice(0, 50) }).then((r) => {
      if (r.ok && r.data) setSelected(r.data);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on mount
  }, []);

  // First page immediately, then debounced while typing.
  const firstLoad = useRef(true);
  useEffect(() => {
    const t = setTimeout(() => load({ page: 1, append: false, q, kind }), firstLoad.current ? 0 : 300);
    firstLoad.current = false;
    return () => clearTimeout(t);
  }, [q, kind, load]);

  const limit = multiple ? (maxItems ?? 50) : 1;
  const isSelected = (id: string) => selected.some((s) => s.id === id);

  function toggle(asset: PickerAsset) {
    if (!multiple) {
      setSelected(isSelected(asset.id) ? [] : [asset]);
      return;
    }
    setSelected((prev) => (prev.some((s) => s.id === asset.id) ? prev.filter((s) => s.id !== asset.id) : prev.length >= limit ? prev : [...prev, asset]));
  }

  async function addCreated(ids: string[]) {
    const r = await getPickerAssetsAction({ ids });
    if (!r.ok || !r.data) return;
    const usable = r.data.filter((a) => allowed.includes(a.kind));
    setItems((prev) => [...usable, ...prev.filter((p) => !ids.includes(p.id))]);
    setSelected((prev) => (multiple ? [...prev, ...usable].slice(0, limit) : usable.slice(0, 1)));
    setTab("library");
  }

  const canEmbed = allowed.includes("embed");
  const canFile = allowed.some((k) => k !== "embed");

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title ?? (multiple ? "Choose media" : "Choose a media item")}
      description={multiple ? `Select up to ${limit} items. ${selected.length} selected.` : "Select one item from the media library."}
      size="lg"
      footer={
        <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
          <span className="text-sm text-muted-foreground sm:mr-auto" aria-live="polite">
            {selected.length === 0 ? "Nothing selected" : `${selected.length} selected`}
          </span>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => {
              onConfirm(selected);
              onOpenChange(false);
            }}
          >
            {multiple ? "Use selected" : "Use this item"}
          </Button>
        </div>
      }
    >
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-4 w-full sm:w-auto">
          <TabsTrigger value="library">Library</TabsTrigger>
          {canUpload && canFile && <TabsTrigger value="upload">Upload</TabsTrigger>}
          {canUpload && canEmbed && <TabsTrigger value="embed">Video link</TabsTrigger>}
        </TabsList>

        <TabsContent value="library" className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Label htmlFor={`${uid}-q`} className="sr-only">
                Search media
              </Label>
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input id={`${uid}-q`} type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by title, alt text or caption" className="pl-9" />
            </div>
            {allowed.length > 1 && (
              <div>
                <Label htmlFor={`${uid}-kind`} className="sr-only">
                  Type
                </Label>
                <select
                  id={`${uid}-kind`}
                  value={kind}
                  onChange={(e) => setKind(e.target.value as MediaKind | "")}
                  className="h-9 w-full rounded-md border bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:w-44"
                >
                  <option value="">All types</option>
                  {allowed.map((k) => (
                    <option key={k} value={k}>
                      {MEDIA_KIND_LABELS[k]}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div aria-live="polite" className="sr-only">
            {pending ? "Loading media" : `${total} items found`}
          </div>
          {error && <p className="text-sm text-danger-strong" role="alert">{error}</p>}

          {items.length === 0 && !pending ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              {q ? "No media matches your search." : "The media library has no items of this type yet."}
              {canUpload && canFile && (
                <div className="mt-3">
                  <Button type="button" variant="outline" size="sm" onClick={() => setTab("upload")}>
                    Upload a file
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <ul className={cn("grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4", pending && "opacity-60")} aria-label="Media items">
              {items.map((asset) => {
                const on = isSelected(asset.id);
                return (
                  <li key={asset.id}>
                    <button
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggle(asset)}
                      className={cn(
                        "group w-full rounded-lg border bg-card p-2 text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                        on ? "border-teal ring-2 ring-teal" : "hover:border-foreground/30",
                      )}
                    >
                      <AssetThumb asset={asset} />
                      <span className="mt-2 block truncate text-sm font-medium">{asset.title}</span>
                      <span className="mt-1 flex items-center justify-between gap-1">
                        <span className="text-xs text-muted-foreground">{MEDIA_KIND_LABELS[asset.kind]}</span>
                        {on && <span className="text-xs font-semibold text-teal-strong">Selected</span>}
                      </span>
                      <span className="mt-1 block">
                        <AssetFlags asset={asset} />
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {page < pageCount && (
            <div className="flex justify-center">
              <Button type="button" variant="outline" disabled={pending} onClick={() => load({ page: page + 1, append: true, q, kind })}>
                {pending ? "Loading…" : "Load more"}
              </Button>
            </div>
          )}
        </TabsContent>

        {canUpload && canFile && (
          <TabsContent value="upload">
            <MediaUploader multiple={multiple} compact onCreated={addCreated} />
          </TabsContent>
        )}
        {canUpload && canEmbed && (
          <TabsContent value="embed">
            <EmbedForm onCreated={(id) => addCreated([id])} />
          </TabsContent>
        )}
      </Tabs>
    </ResponsiveDialog>
  );
}
