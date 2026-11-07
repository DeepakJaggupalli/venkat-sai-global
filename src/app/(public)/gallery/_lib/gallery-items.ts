import type { PublicMediaAsset } from "@/modules/content/types";

import { imageSrc } from "../../news/_components/cms-image";
import type { GalleryItem } from "../_components/media-gallery";

/** Public media assets → serializable lightbox items (unknown kinds and unusable embeds are skipped). */
export function toGalleryItems(assets: PublicMediaAsset[]): GalleryItem[] {
  const items: GalleryItem[] = [];
  for (const asset of assets) {
    if (asset.kind === "image") {
      items.push({
        id: asset.id,
        kind: "image",
        title: asset.title,
        alt: asset.alt ?? "",
        caption: asset.caption,
        credit: asset.credit,
        src: imageSrc(asset, "lg"),
        thumbnail: imageSrc(asset, "thumb"),
        mimeType: asset.mimeType,
        embedUrl: null,
        embedProvider: null,
      });
    } else if (asset.kind === "embed" && asset.embedUrl && (asset.embedProvider === "youtube" || asset.embedProvider === "vimeo")) {
      items.push({
        id: asset.id,
        kind: "embed",
        title: asset.title,
        alt: asset.alt ?? asset.title,
        caption: asset.caption,
        credit: asset.credit,
        src: asset.embedUrl,
        thumbnail: asset.thumbnailUrl,
        mimeType: null,
        embedUrl: asset.embedUrl,
        embedProvider: asset.embedProvider,
      });
    } else if (asset.kind === "video") {
      items.push({
        id: asset.id,
        kind: "video",
        title: asset.title,
        alt: asset.alt ?? asset.title,
        caption: asset.caption,
        credit: asset.credit,
        src: asset.url,
        thumbnail: asset.thumbnailUrl,
        mimeType: asset.mimeType,
        embedUrl: null,
        embedProvider: null,
      });
    }
  }
  return items;
}
