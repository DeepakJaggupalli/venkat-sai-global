/**
 * Media picker DTO (client-safe) shared by the picker dialog and the server pages that preload
 * selected assets.
 */
import type { ContentConsentStatus, MediaKind } from "@/db/schema";

export type PickerAsset = {
  id: string;
  kind: MediaKind;
  title: string;
  altText: string | null;
  thumbnailUrl: string | null;
  url: string | null;
  mimeType: string | null;
  visibility: "public" | "internal";
  status: "active" | "archived";
  consentStatus: ContentConsentStatus;
  showsIdentifiablePeople: boolean | null;
};

type DetailLike = {
  asset: {
    id: string;
    kind: MediaKind;
    title: string;
    altText: string | null;
    visibility: "public" | "internal";
    status: "active" | "archived";
    consentStatus: ContentConsentStatus;
    showsIdentifiablePeople: boolean | null;
  };
  file: { mimeType: string } | null;
  url: string | null;
  thumbnailUrl: string | null;
};

export function toPickerAsset(d: DetailLike): PickerAsset {
  return {
    id: d.asset.id,
    kind: d.asset.kind,
    title: d.asset.title,
    altText: d.asset.altText,
    thumbnailUrl: d.thumbnailUrl,
    url: d.url,
    mimeType: d.file?.mimeType ?? null,
    visibility: d.asset.visibility,
    status: d.asset.status,
    consentStatus: d.asset.consentStatus,
    showsIdentifiablePeople: d.asset.showsIdentifiablePeople,
  };
}

export type PickerAssetMap = Record<string, PickerAsset>;
