"use client";

import { Archive, Crop, Eye, EyeOff, RotateCcw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { archiveMediaAssetAction, deleteMediaAssetAction, restoreMediaAssetAction, setMediaVisibilityAction } from "@/modules/content/actions";
import { CONTENT_ADMIN_PATHS } from "@/modules/content/links";

import { canCrop, ImageCropper, type CropSource } from "./image-cropper";

/**
 * Public / internal switch, crop, archive / restore and delete for one media item. Archive and delete are
 * refused while the item is used (the module lists where), so the buttons are disabled with the reason.
 */
export function MediaAssetActions({
  id,
  visibility,
  status,
  usageCount,
  showsPeople,
  consentObtained,
  peopleAssessed,
  altMissing,
  openApprovalCode,
  crop,
}: {
  id: string;
  visibility: "public" | "internal";
  status: "active" | "archived";
  usageCount: number;
  showsPeople: boolean;
  consentObtained: boolean;
  peopleAssessed: boolean;
  altMissing: boolean;
  openApprovalCode: string | null;
  crop: CropSource | null;
}) {
  const router = useRouter();
  const [cropOpen, setCropOpen] = useState(false);
  const blockers: string[] = [];
  if (!peopleAssessed) blockers.push("Answer whether identifiable people appear.");
  if (altMissing) blockers.push("Add alt text (or mark the image as decorative).");
  if (showsPeople && !consentObtained) blockers.push("Record the consent of the people shown.");
  const inUse = usageCount > 0;

  return (
    <div className="space-y-4">
      {visibility === "internal" ? (
        <div className="space-y-2">
          {blockers.length > 0 && (
            <ul className="list-disc space-y-1 pl-5 text-sm text-warning-strong" aria-label="Before it can be public">
              {blockers.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          )}
          {openApprovalCode ? (
            <p className="rounded-md bg-info-soft px-3 py-2 text-sm text-info">Public use is awaiting approval ({openApprovalCode}).</p>
          ) : (
            <ConfirmDialog
              trigger={
                <Button type="button" className="w-full" disabled={blockers.length > 0 || status === "archived"}>
                  <Eye aria-hidden />
                  {showsPeople ? "Request public use" : "Make public"}
                </Button>
              }
              title={showsPeople ? "Send for approval?" : "Make this item public?"}
              description={
                showsPeople
                  ? "A second person checks the recorded consent in the approval centre before the item can appear on the website."
                  : "It can then be used on published pages. The file becomes publicly reachable by its link."
              }
              confirmLabel={showsPeople ? "Send for approval" : "Make public"}
              onConfirm={() => setMediaVisibilityAction({ id, visibility: "public" })}
              onSuccess={() => router.refresh()}
            />
          )}
        </div>
      ) : (
        <ConfirmDialog
          trigger={
            <Button type="button" variant="outline" className="w-full">
              <EyeOff aria-hidden />
              Make internal
            </Button>
          }
          title="Make this item internal?"
          description={inUse ? `It is used in ${usageCount} ${usageCount === 1 ? "place" : "places"}; those pages stop showing it immediately.` : "It stops being publicly reachable."}
          confirmLabel="Make internal"
          onConfirm={() => setMediaVisibilityAction({ id, visibility: "internal" })}
          onSuccess={() => router.refresh()}
        />
      )}

      {crop && canCrop(crop.mimeType) && status === "active" && (
        <>
          <Button type="button" variant="outline" className="w-full" onClick={() => setCropOpen(true)}>
            <Crop aria-hidden />
            Crop into a new copy
          </Button>
          {cropOpen && <ImageCropper open={cropOpen} onOpenChange={setCropOpen} source={crop} onCreated={(newId) => router.push(CONTENT_ADMIN_PATHS.mediaAsset(newId))} />}
        </>
      )}

      <div className="space-y-2 border-t pt-4">
        {status === "active" ? (
          <ConfirmDialog
            trigger={
              <Button type="button" variant="ghost" className="w-full justify-start" disabled={inUse}>
                <Archive aria-hidden />
                Archive
              </Button>
            }
            title="Archive this item?"
            description="It is hidden from the library and from pickers. You can restore it later."
            confirmLabel="Archive"
            onConfirm={() => archiveMediaAssetAction({ id })}
            onSuccess={() => router.refresh()}
          />
        ) : (
          <Button
            type="button"
            variant="ghost"
            className="w-full justify-start"
            onClick={async () => {
              await restoreMediaAssetAction({ id });
              router.refresh();
            }}
          >
            <RotateCcw aria-hidden />
            Restore
          </Button>
        )}
        <ConfirmDialog
          trigger={
            <Button type="button" variant="ghost" className="w-full justify-start text-danger-strong hover:text-danger-strong" disabled={inUse}>
              <Trash2 aria-hidden />
              Delete
            </Button>
          }
          title="Delete this item?"
          description="The file stops being served immediately and is removed permanently after 30 days."
          confirmLabel="Delete"
          variant="destructive"
          onConfirm={() => deleteMediaAssetAction({ id })}
          onSuccess={() => router.push(CONTENT_ADMIN_PATHS.media)}
        />
        {inUse && <p className="text-xs text-muted-foreground">Archive and delete are unavailable while the item is used. Remove it from the pages listed under “Where it is used” first.</p>}
      </div>
    </div>
  );
}
