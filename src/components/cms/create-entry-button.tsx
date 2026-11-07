"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";

import { FormErrorAlert, FormField, SubmitButton, useActionToast } from "@/components/shared/form";
import { ResponsiveDialog } from "@/components/shared/responsive-dialog";
import { SimpleSelect } from "@/components/shared/selects";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CmsCollection } from "@/db/schema";
import { createEntryAction } from "@/modules/content/actions";
import { CONTENT_LOCALE_LABELS, CONTENT_LOCALE_VALUES } from "@/modules/content/constants";
import { CONTENT_ADMIN_PATHS } from "@/modules/content/links";

const localeOptions = CONTENT_LOCALE_VALUES.map((l) => ({ value: l, label: CONTENT_LOCALE_LABELS[l] }));

/**
 * Start a new entry: only the title (and language) is asked for; the full editor opens on the draft.
 * Singletons use `fixedTitle` and create straight away.
 */
export function CreateEntryButton({
  collection,
  singularLabel,
  locale = "en",
  fixedTitle,
  label,
}: {
  collection: CmsCollection;
  singularLabel: string;
  locale?: string;
  fixedTitle?: string;
  label?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(createEntryAction, null);
  useActionToast(state, {
    onSuccess: (r) => {
      setOpen(false);
      if (r.data) router.push(fixedTitle ? `${CONTENT_ADMIN_PATHS.collection(collection)}${locale !== "en" ? `?locale=${locale}` : ""}` : CONTENT_ADMIN_PATHS.entry(collection, r.data.id));
      router.refresh();
    },
  });

  if (fixedTitle) {
    return (
      <form action={formAction} className="space-y-3">
        <input type="hidden" name="collection" value={collection} />
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="title" value={fixedTitle} />
        <FormErrorAlert state={state} />
        <SubmitButton pendingLabel="Creating…">{label ?? `Create ${singularLabel.toLowerCase()}`}</SubmitButton>
      </form>
    );
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Button>
          <Plus aria-hidden />
          {label ?? `New ${singularLabel.toLowerCase()}`}
        </Button>
      }
      title={`New ${singularLabel.toLowerCase()}`}
      description="Start with a title. You can fill in everything else in the editor; nothing is public until you publish."
    >
      <form action={formAction} noValidate className="space-y-4">
        <input type="hidden" name="collection" value={collection} />
        <FormErrorAlert state={state} />
        <FormField label="Title" name="title" required state={state}>
          <Input maxLength={200} autoFocus />
        </FormField>
        <FormField label="Language" name="locale" state={state}>
          {(control) => <SimpleSelect {...control} name="locale" options={localeOptions} defaultValue={locale} />}
        </FormField>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <SubmitButton pendingLabel="Creating…">Create draft</SubmitButton>
        </div>
      </form>
    </ResponsiveDialog>
  );
}
