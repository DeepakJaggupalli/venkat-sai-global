"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { FileUpload } from "@/components/files";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { FileSummary } from "@/modules/files/types";

import { setCompanyLogoAction, setPublicPageAction } from "../actions";

/** Logo upload (saved as soon as the upload finishes) and the public company page switch. */
export function BrandingControls({
  organizationId,
  logo,
  isPublic,
  isVerified,
  publicUrl,
}: {
  organizationId: string;
  logo: FileSummary | null;
  isPublic: boolean;
  isVerified: boolean;
  publicUrl: string;
}) {
  const [publicOn, setPublicOn] = useState(isPublic);
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState("");

  function saveLogo(files: FileSummary[]) {
    const next = files[0]?.id ?? null;
    if (next === (logo?.id ?? null)) return;
    startTransition(async () => {
      const result = await setCompanyLogoAction({ fileId: next });
      if (result.ok) {
        setStatus(result.message ?? "Logo saved.");
        toast.success(result.message ?? "Logo saved.");
      } else {
        setStatus(result.error);
        toast.error(result.error);
      }
    });
  }

  function togglePublic(next: boolean) {
    const previous = publicOn;
    setPublicOn(next);
    startTransition(async () => {
      const result = await setPublicPageAction({ isPublic: next });
      if (result.ok) {
        setStatus(result.message ?? "Saved.");
        toast.success(result.message ?? "Saved.");
      } else {
        setPublicOn(previous);
        setStatus(result.error);
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="space-y-2">
        <FileUpload
          purpose="org_logo"
          name="logoFileId"
          organizationId={organizationId}
          label="Company logo"
          description="Square JPG, PNG or WebP, up to 5 MB. Shown on your jobs and public page."
          defaultFiles={logo ? [logo] : []}
          onChange={saveLogo}
          disabled={pending}
        />
      </div>
      <div className="space-y-3 rounded-lg border border-border p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <Label htmlFor="public-page-switch" className="text-sm font-semibold text-foreground">
              Public company page
            </Label>
            <p id="public-page-hint" className="text-sm text-muted-foreground">
              Lists your company, description and open jobs in the employer directory. It is only shown while your company is verified.
            </p>
          </div>
          <Switch id="public-page-switch" checked={publicOn} onCheckedChange={togglePublic} disabled={pending} aria-describedby="public-page-hint" />
        </div>
        {publicOn && isVerified ? (
          <a href={publicUrl} className="text-sm font-medium text-teal-strong underline underline-offset-4" target="_blank" rel="noreferrer">
            View your public page
          </a>
        ) : publicOn ? (
          <p className="text-sm text-muted-foreground">Your page will appear once Venkat Sai verifies your company.</p>
        ) : null}
      </div>
      <p className="sr-only" aria-live="polite">
        {status}
      </p>
    </div>
  );
}
