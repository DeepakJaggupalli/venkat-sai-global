"use client";

import { ArrowDown, ArrowUp, Crop, ImagePlus, X } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import type { MediaKind } from "@/db/schema";
import type { PickerAsset, PickerAssetMap } from "@/app/admin/media/_lib/picker-types";
import { getPickerAssetsAction } from "@/app/admin/media/_lib/picker-actions";
import { CONTENT_ADMIN_PATHS } from "@/modules/content/links";

import { AssetFlags, AssetPickerDialog, AssetThumb } from "./asset-picker";
import { moveItem } from "./field-utils";
import { canCrop, ImageCropper } from "./image-cropper";

export type AssetFieldProps = {
  value: string | string[] | undefined | null;
  onChange: (value: string | string[] | undefined) => void;
  multiple?: boolean;
  kinds?: readonly MediaKind[];
  maxItems?: number;
  assets: PickerAssetMap;
  rememberAssets: (list: PickerAsset[]) => void;
  canUpload: boolean;
  /** Visible label text (used in button names). */
  label: string;
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean | "true" | "false";
  disabled?: boolean;
  /** Hidden input for native forms (single value) — the CMS entry editor posts JSON instead. */
  name?: string;
};

/** Selected media with thumbnails, plus choose / replace / crop / remove / reorder. */
export function AssetField({ value, onChange, multiple = false, kinds, maxItems, assets, rememberAssets, canUpload, label, id, disabled, name, ...aria }: AssetFieldProps) {
  const ids = multiple ? (Array.isArray(value) ? value : []) : typeof value === "string" && value ? [value] : [];
  const [open, setOpen] = useState(false);
  const [cropId, setCropId] = useState<string | null>(null);
  const cropAsset = cropId ? assets[cropId] : undefined;

  function confirm(list: PickerAsset[]) {
    rememberAssets(list);
    if (multiple) onChange(list.map((a) => a.id).slice(0, maxItems ?? 50));
    else onChange(list[0]?.id);
  }

  function remove(assetId: string) {
    if (multiple) onChange(ids.filter((x) => x !== assetId));
    else onChange(undefined);
  }

  async function onCropped(newId: string) {
    const r = await getPickerAssetsAction({ ids: [newId] });
    if (r.ok && r.data) rememberAssets(r.data);
    if (multiple) onChange(ids.map((x) => (x === cropId ? newId : x)));
    else onChange(newId);
  }

  return (
    <div id={id} className="space-y-3" role="group" aria-label={label} aria-describedby={aria["aria-describedby"]} data-invalid={aria["aria-invalid"] ? "true" : undefined}>
      {name && <input type="hidden" name={name} value={ids[0] ?? ""} />}
      {ids.length > 0 && (
        <ul className={multiple ? "grid grid-cols-2 gap-3 sm:grid-cols-3" : "max-w-xs"}>
          {ids.map((assetId, index) => {
            const asset = assets[assetId];
            return (
              <li key={assetId} className="rounded-lg border bg-card p-2">
                <AssetThumb asset={asset} />
                <p className="mt-2 truncate text-sm font-medium">
                  {asset ? (
                    <a href={CONTENT_ADMIN_PATHS.mediaAsset(assetId)} target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:underline">
                      {asset.title}
                    </a>
                  ) : (
                    "Media item"
                  )}
                </p>
                {asset && (
                  <div className="mt-1">
                    <AssetFlags asset={asset} />
                  </div>
                )}
                {!disabled && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {multiple && (
                      <>
                        <Button type="button" variant="ghost" size="icon-sm" disabled={index === 0} onClick={() => onChange(moveItem(ids, index, index - 1))} aria-label={`Move ${asset?.title ?? "item"} earlier`}>
                          <ArrowUp aria-hidden />
                        </Button>
                        <Button type="button" variant="ghost" size="icon-sm" disabled={index === ids.length - 1} onClick={() => onChange(moveItem(ids, index, index + 1))} aria-label={`Move ${asset?.title ?? "item"} later`}>
                          <ArrowDown aria-hidden />
                        </Button>
                      </>
                    )}
                    {canUpload && asset?.kind === "image" && canCrop(asset.mimeType) && asset.url && (
                      <Button type="button" variant="ghost" size="icon-sm" onClick={() => setCropId(assetId)} aria-label={`Crop ${asset.title}`}>
                        <Crop aria-hidden />
                      </Button>
                    )}
                    <Button type="button" variant="ghost" size="icon-sm" onClick={() => remove(assetId)} aria-label={`Remove ${asset?.title ?? "item"} from ${label}`}>
                      <X aria-hidden />
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {!disabled && (
        <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
          <ImagePlus aria-hidden />
          {ids.length === 0 ? `Choose ${multiple ? "media" : "an item"}` : multiple ? "Add or change media" : "Replace"}
          <span className="sr-only"> for {label}</span>
        </Button>
      )}
      {open && (
        <AssetPickerDialog
        open={open}
        onOpenChange={setOpen}
        kinds={kinds}
        multiple={multiple}
        maxItems={maxItems}
        selectedIds={ids}
        onConfirm={confirm}
        canUpload={canUpload}
        title={`Choose: ${label}`}
        />
      )}
      {cropAsset && cropAsset.url && (
        <ImageCropper
          open={Boolean(cropId)}
          onOpenChange={(o) => !o && setCropId(null)}
          source={{ id: cropAsset.id, title: cropAsset.title, url: cropAsset.url, mimeType: cropAsset.mimeType, altText: cropAsset.altText, showsIdentifiablePeople: cropAsset.showsIdentifiablePeople }}
          onCreated={onCropped}
        />
      )}
    </div>
  );
}
