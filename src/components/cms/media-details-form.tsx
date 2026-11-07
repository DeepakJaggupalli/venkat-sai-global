"use client";

import { useActionState, useId, useState } from "react";

import { FormErrorAlert, FormField, SubmitButton, useActionToast } from "@/components/shared/form";
import { SimpleSelect } from "@/components/shared/selects";
import { TagInput } from "@/components/shared/tag-input";
import type { SelectOption } from "@/components/shared/types";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import type { MediaKind } from "@/db/schema";
import { updateMediaAssetAction } from "@/modules/content/actions";

export type MediaDetailsValues = {
  id: string;
  kind: MediaKind;
  title: string;
  altText: string | null;
  caption: string | null;
  description: string | null;
  credit: string | null;
  tags: string[];
  folderId: string | null;
  showsIdentifiablePeople: boolean | null;
};

/** Title, alt text (images), caption, credit, tags, folder and the people assessment of a media item. */
export function MediaDetailsForm({ values, folders, disabled }: { values: MediaDetailsValues; folders: SelectOption[]; disabled?: boolean }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const [state, formAction] = useActionState(updateMediaAssetAction, null);
  const [decorative, setDecorative] = useState(values.altText === "");
  useActionToast(state);
  const isImage = values.kind === "image";

  return (
    <form action={formAction} noValidate className="space-y-4">
      <input type="hidden" name="id" value={values.id} />
      <FormErrorAlert state={state} fieldLabels={{ title: "Title", altText: "Alt text" }} />
      <FormField label="Title" name="title" required state={state} hint="For finding the item in the library. Not shown to visitors.">
        <Input defaultValue={values.title} maxLength={200} disabled={disabled} />
      </FormField>
      {isImage && (
        <div className="space-y-2">
          <FormField
            label="Alt text"
            name="altText"
            state={state}
            hint="Required before an image can be public. Describe what matters in the image, for example “Trainee welders in safety gear at the Visakhapatnam workshop”."
          >
            <Textarea rows={2} defaultValue={values.altText ?? ""} maxLength={300} disabled={disabled || decorative} />
          </FormField>
          <div className="flex items-center gap-2">
            <input type="hidden" name="decorative" value={decorative ? "true" : "false"} />
            <Checkbox id={`${uid}-dec`} checked={decorative} onCheckedChange={(v) => setDecorative(v === true)} disabled={disabled} />
            <Label htmlFor={`${uid}-dec`} className="font-normal">
              Decorative only (screen readers skip it)
            </Label>
          </div>
        </div>
      )}
      {!isImage && <input type="hidden" name="decorative" value="false" />}
      <FormField label="Caption" name="caption" optional state={state} hint="Shown under the image where the page supports captions.">
        <Input defaultValue={values.caption ?? ""} maxLength={500} disabled={disabled} />
      </FormField>
      <FormField label="Credit" name="credit" optional state={state} hint="Photographer or source, when attribution is required.">
        <Input defaultValue={values.credit ?? ""} maxLength={200} disabled={disabled} />
      </FormField>
      <FormField label="Internal description" name="description" optional state={state}>
        <Textarea rows={2} defaultValue={values.description ?? ""} maxLength={2000} disabled={disabled} />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Folder" name="folderId" optional state={state}>
          {(control) => <SimpleSelect {...control} name="folderId" options={folders} defaultValue={values.folderId ?? ""} allowClear clearLabel="Unfiled" placeholder="Unfiled" disabled={disabled} />}
        </FormField>
        <FormField label="Tags" name="tags" optional state={state} hint="Press Enter after each tag.">
          {(control) => <TagInput {...control} name="tags" defaultValue={values.tags} lowercase maxTags={20} maxLength={40} disabled={disabled} />}
        </FormField>
      </div>
      <fieldset className="space-y-1.5" disabled={disabled}>
        <legend className="text-sm font-medium">Does it show identifiable people?</legend>
        <p className="text-xs text-muted-foreground">Faces or other details that identify someone. Changing this to “Yes” makes a public item internal until consent is approved.</p>
        <RadioGroup name="showsIdentifiablePeople" defaultValue={values.showsIdentifiablePeople === null ? "" : values.showsIdentifiablePeople ? "yes" : "no"} className="flex flex-wrap gap-4">
          <div className="flex items-center gap-2">
            <RadioGroupItem value="no" id={`${uid}-pno`} />
            <Label htmlFor={`${uid}-pno`} className="font-normal">No</Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="yes" id={`${uid}-pyes`} />
            <Label htmlFor={`${uid}-pyes`} className="font-normal">Yes</Label>
          </div>
        </RadioGroup>
      </fieldset>
      {!disabled && <SubmitButton pendingLabel="Saving…">Save details</SubmitButton>}
    </form>
  );
}
