"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { FileUpload } from "@/components/files";
import { Button } from "@/components/ui/button";
import type { FileSummary } from "@/modules/files/types";
import { submitChecklistItemAction } from "@/modules/recruitment/actions";

/** Upload a requested mobilisation document for a candidate the partner placed. */
export function ChecklistUpload({ itemId, itemLabel, organizationId }: { itemId: string; itemLabel: string; organizationId: string }) {
  const router = useRouter();
  const [file, setFile] = useState<FileSummary | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const errorId = `checklist-${itemId}-error`;

  function submit() {
    if (!file) {
      setError("Upload the document first.");
      return;
    }
    startTransition(async () => {
      const result = await submitChecklistItemAction({ portal: "recruiter", itemId, fileId: file.id });
      if (result.ok) {
        setError(null);
        toast.success(result.message ?? "Submitted for checking.");
        router.refresh();
      } else {
        setError(result.fieldErrors?.fileId?.[0] ?? result.error);
      }
    });
  }

  return (
    <div className="space-y-2">
      <FileUpload
        purpose="mobilisation_document"
        name={`file-${itemId}`}
        organizationId={organizationId}
        label={`Upload ${itemLabel}`}
        description="PDF or a clear photo, up to 15 MB."
        invalid={Boolean(error)}
        errorId={errorId}
        onUploadingChange={setUploading}
        onChange={(files) => setFile(files[0] ?? null)}
      />
      {error ? (
        <p id={errorId} className="text-sm font-medium text-danger-strong" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end">
        <Button type="button" size="sm" onClick={submit} disabled={uploading} aria-disabled={pending || uploading}>
          {pending ? "Submitting…" : "Submit for checking"}
        </Button>
      </div>
    </div>
  );
}
