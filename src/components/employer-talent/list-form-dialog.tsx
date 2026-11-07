"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactElement } from "react";

import { FormErrorAlert, FormField, SubmitButton } from "@/components/shared/form";
import { ResponsiveDialog } from "@/components/shared/responsive-dialog";
import { SimpleSelect } from "@/components/shared/selects";
import type { SelectOption } from "@/components/shared/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createTalentListAction, updateTalentListAction } from "@/modules/recruitment/actions";

import { TALENT_LIST_KIND_LABELS } from "./labels";
import { textOf, useRunAction } from "./use-run-action";

const KIND_OPTIONS: SelectOption[] = Object.entries(TALENT_LIST_KIND_LABELS).map(([value, label]) => ({ value, label }));

export type ListFormValues = { id: string; name: string; description: string | null; kind: string; jobId: string | null; isShared: boolean };

/** Create a talent list, or edit one (`list`). */
export function ListFormDialog({ list, jobs, trigger }: { list?: ListFormValues; jobs: SelectOption[]; trigger?: ReactElement }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const create = useRunAction(createTalentListAction, {
    onSuccess: (data) => {
      setOpen(false);
      if (data?.id) router.push(`/employer/lists/${data.id}`);
    },
  });
  const update = useRunAction(updateTalentListAction, { onSuccess: () => setOpen(false) });
  const active = list ? update : create;

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const base = {
      portal: "employer" as const,
      name: String(form.get("name") ?? ""),
      description: textOf(form, "description") ?? null,
      kind: (textOf(form, "kind") ?? "shortlist") as "shortlist",
      jobId: textOf(form, "jobId") ?? null,
      isShared: form.get("isShared") === "true",
    };
    if (list) void update.run({ ...base, listId: list.id });
    else void create.run(base);
  };

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) active.reset();
      }}
      trigger={
        trigger ?? (
          <Button type="button">
            <Plus aria-hidden className="size-4" />
            New list
          </Button>
        )
      }
      title={list ? "Edit list" : "New talent list"}
      description="Use lists for shortlists, saved candidates, hiring projects or a standing talent pool."
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <FormErrorAlert state={active.state} />
        <FormField label="Name" name="name" required state={active.state}>
          <Input defaultValue={list?.name} maxLength={120} />
        </FormField>
        <FormField label="Type" name="kind" state={active.state}>
          <SimpleSelect options={KIND_OPTIONS} defaultValue={list?.kind ?? "shortlist"} />
        </FormField>
        {jobs.length ? (
          <FormField label="Linked job" name="jobId" optional state={active.state}>
            <SimpleSelect options={jobs} defaultValue={list?.jobId ?? undefined} placeholder="No linked job" allowClear clearLabel="No linked job" />
          </FormField>
        ) : null}
        <FormField label="Description" name="description" optional state={active.state}>
          <Textarea rows={3} maxLength={2000} defaultValue={list?.description ?? undefined} />
        </FormField>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="isShared" value="true" defaultChecked={list?.isShared ?? false} className="mt-0.5 size-4" />
          <span>
            Share with my team
            <span className="block text-xs text-muted-foreground">Private lists are visible only to you.</span>
          </span>
        </label>
        <div className="flex justify-end">
          <SubmitButton pending={active.pending} pendingLabel="Saving…">
            {list ? "Save changes" : "Create list"}
          </SubmitButton>
        </div>
      </form>
    </ResponsiveDialog>
  );
}
