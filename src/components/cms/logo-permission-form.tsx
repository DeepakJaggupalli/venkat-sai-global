"use client";

import { useRouter } from "next/navigation";
import { useActionState, useCallback, useId, useState } from "react";

import { FileUpload } from "@/components/files";
import { FormErrorAlert, FormField, SubmitButton, useActionToast } from "@/components/shared/form";
import { SimpleSelect } from "@/components/shared/selects";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { LogoDisplayLocation, LogoPermissionType, LogoRelationship } from "@/db/schema";
import type { PickerAsset, PickerAssetMap } from "@/app/admin/media/_lib/picker-types";
import { saveLogoPermissionAction } from "@/modules/content/actions";
import {
  LOGO_DISPLAY_LOCATION_LABELS,
  LOGO_DISPLAY_LOCATION_VALUES,
  LOGO_PERMISSION_TYPE_LABELS,
  LOGO_PERMISSION_TYPE_VALUES,
  LOGO_RELATIONSHIP_LABELS,
  LOGO_RELATIONSHIP_VALUES,
} from "@/modules/content/constants";
import { CONTENT_ADMIN_PATHS } from "@/modules/content/links";
import type { FileSummary } from "@/modules/files/types";

import { AssetField } from "./asset-field";

export type LogoPermissionValues = {
  id?: string;
  organizationName: string;
  relationship: LogoRelationship;
  logoAssetId: string | null;
  permissionType: LogoPermissionType;
  evidenceFile: FileSummary | null;
  evidenceReference: string | null;
  grantedByName: string | null;
  grantedByDesignation: string | null;
  grantedAt: string | null;
  expiresAt: string | null;
  displayLocations: LogoDisplayLocation[];
  conditions: string | null;
  notes: string | null;
};

const relationshipOptions = LOGO_RELATIONSHIP_VALUES.map((v) => ({ value: v, label: LOGO_RELATIONSHIP_LABELS[v] }));
const typeOptions = LOGO_PERMISSION_TYPE_VALUES.map((v) => ({ value: v, label: LOGO_PERMISSION_TYPE_LABELS[v] }));

/** Record the written permission to show an organisation's logo: who granted it, the evidence, where and until when. */
export function LogoPermissionForm({ values, assets: initialAssets, canUpload, disabled }: { values: LogoPermissionValues; assets: PickerAssetMap; canUpload: boolean; disabled?: boolean }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const router = useRouter();
  const [state, formAction] = useActionState(saveLogoPermissionAction, null);
  const [logoAssetId, setLogoAssetId] = useState<string | null>(values.logoAssetId);
  const [assets, setAssets] = useState<PickerAssetMap>(initialAssets);
  const remember = useCallback((list: PickerAsset[]) => setAssets((prev) => ({ ...prev, ...Object.fromEntries(list.map((a) => [a.id, a])) })), []);
  useActionToast(state, {
    onSuccess: (r) => {
      if (!values.id && r.data) router.push(CONTENT_ADMIN_PATHS.logoPermission(r.data.id));
      else router.refresh();
    },
  });
  const fieldErrors = state && !state.ok ? state.fieldErrors : undefined;

  return (
    <form action={formAction} noValidate className="space-y-5">
      {values.id && <input type="hidden" name="id" value={values.id} />}
      <FormErrorAlert state={state} fieldLabels={{ organizationName: "Organisation name", relationship: "Relationship", permissionType: "Type of permission" }} />
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Organisation name" name="organizationName" required state={state} hint="Exactly as the permission allows it to be shown.">
          <Input defaultValue={values.organizationName} maxLength={200} disabled={disabled} />
        </FormField>
        <FormField label="Relationship" name="relationship" required state={state}>
          {(control) => <SimpleSelect {...control} name="relationship" options={relationshipOptions} defaultValue={values.relationship} disabled={disabled} />}
        </FormField>
      </div>
      <FormField label="Logo" name="logoAssetId" optional state={state} hint="The logo file from the media library, as supplied by the organisation.">
        {(control) => (
          <AssetField
            id={control.id}
            aria-describedby={control["aria-describedby"]}
            label="Logo"
            name="logoAssetId"
            kinds={["image"]}
            value={logoAssetId}
            onChange={(v) => setLogoAssetId(typeof v === "string" ? v : null)}
            assets={assets}
            rememberAssets={remember}
            canUpload={canUpload}
            disabled={disabled}
          />
        )}
      </FormField>

      <fieldset className="space-y-4 rounded-lg border p-4" disabled={disabled}>
        <legend className="px-1 font-heading text-sm font-semibold">Evidence</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Type of permission" name="permissionType" required state={state}>
            {(control) => <SimpleSelect {...control} name="permissionType" options={typeOptions} defaultValue={values.permissionType} />}
          </FormField>
          <FormField label="Reference" name="evidenceReference" optional state={state} hint="Contract clause number, email subject and date…">
            <Input defaultValue={values.evidenceReference ?? ""} maxLength={500} />
          </FormField>
        </div>
        <FormField label="Evidence file" name="evidenceFileId" optional state={state} hint="Signed letter, contract page or saved email (PDF or image). Required before approval unless the reference identifies the document.">
          {(control) => (
            <FileUpload
              purpose="cms_media"
              visibility="private"
              name="evidenceFileId"
              id={control.id}
              errorId={control["aria-describedby"]}
              invalid={Boolean(control["aria-invalid"])}
              defaultFiles={values.evidenceFile ? [values.evidenceFile] : []}
              disabled={disabled}
            />
          )}
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Granted by" name="grantedByName" optional state={state}>
            <Input defaultValue={values.grantedByName ?? ""} maxLength={160} />
          </FormField>
          <FormField label="Their designation" name="grantedByDesignation" optional state={state}>
            <Input defaultValue={values.grantedByDesignation ?? ""} maxLength={160} />
          </FormField>
          <FormField label="Granted on" name="grantedAt" optional state={state}>
            <Input type="date" defaultValue={values.grantedAt ?? ""} />
          </FormField>
          <FormField label="Expires on" name="expiresAt" optional state={state} hint="Logos go offline automatically on this date.">
            <Input type="date" defaultValue={values.expiresAt ?? ""} />
          </FormField>
        </div>
      </fieldset>

      <fieldset className="space-y-2" disabled={disabled} aria-describedby={fieldErrors?.displayLocations ? `${uid}-loc-err` : `${uid}-loc-hint`}>
        <legend className="text-sm font-medium">Where the logo may appear</legend>
        <p id={`${uid}-loc-hint`} className="text-xs text-muted-foreground">
          Tick only the places the permission covers. The website never shows the logo anywhere else.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {LOGO_DISPLAY_LOCATION_VALUES.map((loc) => (
            <div key={loc} className="flex items-center gap-2">
              <Checkbox id={`${uid}-${loc}`} name="displayLocations[]" value={loc} defaultChecked={values.displayLocations.includes(loc)} />
              <Label htmlFor={`${uid}-${loc}`} className="font-normal">
                {LOGO_DISPLAY_LOCATION_LABELS[loc]}
              </Label>
            </div>
          ))}
        </div>
        {fieldErrors?.displayLocations && (
          <p id={`${uid}-loc-err`} className="text-sm text-danger-strong">
            {fieldErrors.displayLocations[0]}
          </p>
        )}
      </fieldset>

      <FormField label="Conditions" name="conditions" optional state={state} hint="Any limits set by the organisation, for example “greyscale only” or “not next to competitors”.">
        <Textarea rows={2} defaultValue={values.conditions ?? ""} maxLength={1000} disabled={disabled} />
      </FormField>
      <FormField label="Internal notes" name="notes" optional state={state}>
        <Textarea rows={2} defaultValue={values.notes ?? ""} maxLength={2000} disabled={disabled} />
      </FormField>
      {!disabled && <SubmitButton pendingLabel="Saving…">{values.id ? "Save changes" : "Record permission"}</SubmitButton>}
    </form>
  );
}
