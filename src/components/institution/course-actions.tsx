"use client";

import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import { FileUpload } from "@/components/files";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { FormErrorAlert, FormField, SubmitButton, useActionToast } from "@/components/shared/form";
import { ResponsiveDialog } from "@/components/shared/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { FileSummary } from "@/modules/files/types";
import {
  addCourseModuleAction,
  archiveCourseAction,
  deleteCourseAction,
  removeCourseModuleAction,
  reorderCourseModulesAction,
  restoreCourseAction,
  submitCourseAction,
  updateCourseModuleAction,
} from "@/modules/training/actions";

import { eitherFormAction, useInstitutionForm } from "./use-form-action";

/** Lifecycle buttons for a course: submit for publication, archive, restore, delete (rules enforced by the training service). */
export function CourseLifecycleActions({ courseId, status, hasBatches }: { courseId: string; status: string; hasBatches: boolean }) {
  const router = useRouter();
  const submittable = ["draft", "changes_requested", "rejected"].includes(status);
  return (
    <div className="flex flex-wrap gap-2">
      {submittable ? (
        <ConfirmDialog
          trigger={<Button>Submit for publication</Button>}
          title="Submit this course for publication?"
          description="Venkat Sai reviews the course before it appears in the public catalogue. You need a summary or description, a duration, at least one syllabus module and a verified institution."
          confirmLabel="Submit for review"
          onConfirm={async () => {
            const result = await submitCourseAction({ via: "institution", courseId });
            if (result.ok) router.refresh();
            return result;
          }}
        />
      ) : null}
      {status !== "archived" ? (
        <ConfirmDialog
          trigger={<Button variant="outline">Archive</Button>}
          title="Archive this course?"
          description="It is hidden from the catalogue and any open review is cancelled. Existing batches continue. You can restore it later as a draft."
          confirmLabel="Archive course"
          onConfirm={async () => {
            const result = await archiveCourseAction({ via: "institution", courseId });
            if (result.ok) router.refresh();
            return result;
          }}
        />
      ) : (
        <ConfirmDialog
          trigger={<Button variant="outline">Restore as draft</Button>}
          title="Restore this course?"
          description="It comes back as a draft. Submit it again to publish it."
          confirmLabel="Restore"
          onConfirm={async () => {
            const result = await restoreCourseAction({ via: "institution", courseId });
            if (result.ok) router.refresh();
            return result;
          }}
        />
      )}
      {!hasBatches ? (
        <ConfirmDialog
          trigger={<Button variant="ghost">Delete</Button>}
          title="Delete this course?"
          description="This cannot be undone. Courses with batches cannot be deleted; archive them instead."
          confirmLabel="Delete course"
          variant="destructive"
          onConfirm={async () => {
            const result = await deleteCourseAction({ via: "institution", courseId });
            if (result.ok) router.push("/institution/courses");
            return result;
          }}
        />
      ) : null}
    </div>
  );
}

export type CourseModuleItem = { id: string; title: string; description: string | null; durationHours: number | null; materials: FileSummary[] };

function ModuleForm({ courseId, organizationId, module, onDone }: { courseId: string; organizationId: string; module?: CourseModuleItem; onDone: () => void }) {
  const router = useRouter();
  const { state, pending, onSubmit } = useInstitutionForm(eitherFormAction(updateCourseModuleAction, addCourseModuleAction, Boolean(module)));
  const [uploading, setUploading] = useState(false);
  useActionToast(state);
  useEffect(() => {
    if (state?.ok) {
      router.refresh();
      onDone();
    }
  }, [state, onDone, router]);
  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {module ? <input type="hidden" name="moduleId" value={module.id} /> : <input type="hidden" name="courseId" value={courseId} />}
      <FormErrorAlert state={state} fieldLabels={{ title: "Module title", description: "Description", durationHours: "Duration (hours)" }} />
      <FormField label="Module title" name="title" required state={state}>
        <Input maxLength={200} defaultValue={module?.title} />
      </FormField>
      <FormField label="Description" name="description" optional state={state} hint="Topics, practical work and what learners should be able to do.">
        <Textarea rows={4} maxLength={5000} defaultValue={module?.description ?? undefined} />
      </FormField>
      <FormField label="Duration (hours)" name="durationHours" optional state={state}>
        <Input type="number" inputMode="decimal" min={0.25} step="0.25" defaultValue={module?.durationHours ?? undefined} />
      </FormField>
      <FileUpload
        purpose="course_material"
        name="materialFileIds"
        multiple
        maxFiles={20}
        organizationId={organizationId}
        label="Materials"
        description="Optional handouts or slides (PDF, images, Word, PowerPoint, Excel; up to 25 MB each). Shared with enrolled learners only."
        defaultFiles={module?.materials ?? []}
        onUploadingChange={setUploading}
      />
      <div className="flex justify-end">
        <SubmitButton pending={pending} disabled={uploading} pendingLabel="Saving…">
          {module ? "Save module" : "Add module"}
        </SubmitButton>
      </div>
    </form>
  );
}

/** Syllabus editor: add, edit, remove and reorder modules (keyboard-friendly up / down buttons). */
export function CourseModulesManager({ courseId, organizationId, modules, editable }: { courseId: string; organizationId: string; modules: CourseModuleItem[]; editable: boolean }) {
  const router = useRouter();
  const [dialog, setDialog] = useState<{ mode: "add" } | { mode: "edit"; module: CourseModuleItem } | null>(null);
  const [pendingMove, startMove] = useTransition();
  const close = () => setDialog(null);

  function move(index: number, delta: -1 | 1) {
    const ids = modules.map((m) => m.id);
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    startMove(async () => {
      const result = await reorderCourseModulesAction({ via: "institution", courseId, moduleIds: ids });
      if (result.ok) router.refresh();
      else toast.error(result.error);
    });
  }

  return (
    <div className="space-y-4">
      {modules.length ? (
        <ol className="divide-y divide-border rounded-lg border border-border" aria-label="Syllabus modules" aria-busy={pendingMove}>
          {modules.map((m, i) => (
            <li key={m.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start" data-testid="course-module">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-teal-soft text-sm font-semibold text-teal-strong" aria-hidden="true">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-foreground">
                  <span className="sr-only">Module {i + 1}: </span>
                  {m.title}
                </p>
                {m.description ? <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{m.description}</p> : null}
                <p className="mt-1 text-xs text-muted-foreground">
                  {[m.durationHours ? `${m.durationHours} h` : null, m.materials.length ? `${m.materials.length} material${m.materials.length === 1 ? "" : "s"}` : null].filter(Boolean).join(" · ") ||
                    "No duration or materials yet"}
                </p>
              </div>
              {editable ? (
                <div className="flex shrink-0 gap-1">
                  <Button variant="ghost" size="icon" onClick={() => move(i, -1)} disabled={i === 0 || pendingMove} aria-label={`Move ${m.title} up`}>
                    <ArrowUp aria-hidden="true" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => move(i, 1)} disabled={i === modules.length - 1 || pendingMove} aria-label={`Move ${m.title} down`}>
                    <ArrowDown aria-hidden="true" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => setDialog({ mode: "edit", module: m })} aria-label={`Edit ${m.title}`}>
                    <Pencil aria-hidden="true" />
                  </Button>
                  <ConfirmDialog
                    trigger={
                      <Button variant="ghost" size="icon" aria-label={`Remove ${m.title}`}>
                        <Trash2 aria-hidden="true" />
                      </Button>
                    }
                    title={`Remove ${m.title}?`}
                    description="The module and its links to materials are removed from the syllabus."
                    confirmLabel="Remove module"
                    variant="destructive"
                    onConfirm={async () => {
                      const result = await removeCourseModuleAction({ via: "institution", moduleId: m.id });
                      if (result.ok) router.refresh();
                      return result;
                    }}
                  />
                </div>
              ) : null}
            </li>
          ))}
        </ol>
      ) : (
        <EmptyState size="sm" title="No syllabus yet" description="Add at least one module before you submit the course for publication." />
      )}
      {editable ? (
        <Button variant="outline" onClick={() => setDialog({ mode: "add" })}>
          <Plus aria-hidden="true" /> Add module
        </Button>
      ) : null}
      <ResponsiveDialog open={dialog !== null} onOpenChange={(o) => (o ? null : close())} title={dialog?.mode === "edit" ? `Edit ${dialog.module.title}` : "Add a module"} size="lg">
        {dialog ? <ModuleForm courseId={courseId} organizationId={organizationId} module={dialog.mode === "edit" ? dialog.module : undefined} onDone={close} /> : null}
      </ResponsiveDialog>
    </div>
  );
}
