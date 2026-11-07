"use client";

import { useActionState, useId } from "react";

import { FormErrorAlert, FormField, SubmitButton, useActionToast } from "@/components/shared/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { createEmbedAssetAction } from "@/modules/content/actions";

/** Add a YouTube or Vimeo video to the media library (stored as a privacy-friendly embed link). */
export function EmbedForm({ folderId, onCreated }: { folderId?: string | null; onCreated?: (id: string) => void }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const [state, formAction] = useActionState(createEmbedAssetAction, null);
  useActionToast(state, { onSuccess: (s) => s.data && onCreated?.(s.data.id) });

  return (
    <form action={formAction} noValidate className="space-y-4">
      <FormErrorAlert state={state} />
      <FormField label="YouTube or Vimeo link" name="url" required state={state} hint="Paste the link from the browser address bar or the Share button.">
        <Input type="url" inputMode="url" placeholder="https://www.youtube.com/watch?v=…" maxLength={500} />
      </FormField>
      <FormField label="Title" name="title" required state={state}>
        <Input maxLength={200} />
      </FormField>
      <FormField label="Caption" name="caption" optional state={state}>
        <Input maxLength={500} />
      </FormField>
      <input type="hidden" name="decorative" value="false" />
      {folderId && <input type="hidden" name="folderId" value={folderId} />}
      <fieldset className="space-y-1.5">
        <legend className="text-sm font-medium">Does the video show identifiable people?</legend>
        <RadioGroup name="showsIdentifiablePeople" className="flex flex-wrap gap-4">
          <div className="flex items-center gap-2">
            <RadioGroupItem value="no" id={`${uid}-no`} />
            <Label htmlFor={`${uid}-no`} className="font-normal">No</Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="yes" id={`${uid}-yes`} />
            <Label htmlFor={`${uid}-yes`} className="font-normal">Yes, consent is needed</Label>
          </div>
        </RadioGroup>
      </fieldset>
      <input type="hidden" name="visibility" value="internal" />
      <p className="text-sm text-muted-foreground">The video is added as internal. Open it in the media library to make it public once checked.</p>
      <SubmitButton pendingLabel="Adding…">Add video</SubmitButton>
    </form>
  );
}
