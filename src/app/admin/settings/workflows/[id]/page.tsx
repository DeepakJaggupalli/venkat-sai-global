import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowDown, ArrowUp, BellOff, BellRing, Copy, Pencil, Plus } from "lucide-react";

import { ActionButton } from "@/components/admin/action-button";
import { ActionForm, type AdminFieldSpec } from "@/components/admin/action-form";
import { Callout } from "@/components/shared/callout";
import { PageHeader } from "@/components/shared/page-header";
import { ResponsiveDialog } from "@/components/shared/responsive-dialog";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { WORKFLOW_STAGE_CATEGORIES } from "@/db/schema/recruitment";
import { humanize } from "@/lib/format";
import { requireStaff, staffCan } from "@/modules/identity/authz";
import { SYSTEM_MANAGED_STAGE_KEYS } from "@/modules/recruitment/workflow";

import { SETTINGS_CRUMB } from "../../_components/settings-nav";
import { duplicateWorkflowAction, moveStageAction, saveStageAction, setDefaultWorkflowAction, updateWorkflowAction } from "../actions";
import { getPlatformWorkflow, type StageRow } from "../_lib/workflows";

type Params = { id: string };
type SP = Record<string, string | string[] | undefined>;
const isUuid = (v: string) => /^[0-9a-f-]{36}$/i.test(v);

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  await requireStaff("settings.view");
  const { id } = await params;
  const found = isUuid(id) ? await getPlatformWorkflow(id) : null;
  return { title: found ? `Workflow: ${found.workflow.name}` : "Workflow" };
}

const categoryOptions = WORKFLOW_STAGE_CATEGORIES.map((c) => ({ value: c, label: humanize(c) }));

function stageFields(stage: StageRow | null): AdminFieldSpec[] {
  const t = (stage?.candidateTranslations ?? {}) as Record<string, { label?: string; description?: string } | undefined>;
  return [
    ...(stage
      ? []
      : ([
          { name: "key", label: "Key", required: true, hint: "Stable identifier, e.g. trade_test or visa_processing. Cannot change later." },
          { name: "category", label: "Category", kind: "select", required: true, options: categoryOptions, hint: "Pipeline rules and reports use the category. Cannot change later." },
        ] satisfies AdminFieldSpec[])),
    { name: "name", label: "Pipeline name (staff and employers)", required: true, defaultValue: stage?.name ?? "" },
    { name: "candidateLabel", label: "Label shown to candidates (English)", required: true, defaultValue: stage?.candidateLabel ?? "" },
    { name: "candidateDescription", label: "Explanation for candidates (English)", kind: "textarea", optional: true, rows: 2, defaultValue: stage?.candidateDescription ?? "" },
    { name: "labelHi", label: "Label in Hindi", optional: true, defaultValue: t.hi?.label ?? "", hint: "Have translations reviewed by a native speaker." },
    { name: "labelTe", label: "Label in Telugu", optional: true, defaultValue: t.te?.label ?? "" },
    { name: "descriptionHi", label: "Explanation in Hindi", kind: "textarea", optional: true, rows: 2, defaultValue: t.hi?.description ?? "" },
    { name: "descriptionTe", label: "Explanation in Telugu", kind: "textarea", optional: true, rows: 2, defaultValue: t.te?.description ?? "" },
    { name: "slaDays", label: "Expected maximum days in this stage", kind: "number", optional: true, min: 1, max: 365, defaultValue: stage?.slaDays ?? null, hint: "Used for “stuck application” alerts. Leave blank for no target." },
    { name: "notifyCandidate", label: "Notify the candidate when an application enters this stage", kind: "checkbox", defaultValue: stage ? stage.notifyCandidate : true, wide: true },
    { name: "isActive", label: "Active (available for moves)", kind: "checkbox", defaultValue: stage ? stage.isActive : true, wide: true },
  ];
}

export default async function WorkflowPage({ params, searchParams }: { params: Promise<Params>; searchParams: Promise<SP> }) {
  const ctx = await requireStaff("settings.view");
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const found = await getPlatformWorkflow(id);
  if (!found) notFound();
  const { workflow, stages } = found;
  const sp = await searchParams;
  const canEdit = staffCan(ctx, "settings.manage");
  const stageParam = typeof sp.stage === "string" ? sp.stage : undefined;
  const editingStage = canEdit && stageParam ? (stageParam === "new" ? "new" : (stages.find((s) => s.id === stageParam) ?? null)) : null;
  const base = `/admin/settings/workflows/${workflow.id}`;

  return (
    <div className="space-y-6">
      <PageHeader
        title={workflow.name}
        eyebrow={<code>{workflow.key}</code>}
        description={workflow.description ?? undefined}
        status={
          <span className="flex gap-1">
            {workflow.isDefault ? <StatusBadge tone="brand">Default</StatusBadge> : null}
            <StatusBadge tone={workflow.isActive ? "success" : "neutral"}>{workflow.isActive ? "Active" : "Inactive"}</StatusBadge>
          </span>
        }
        meta={<span className="text-sm text-muted-foreground">{workflow.stageCount} stages · {workflow.applicationCount} applications</span>}
        breadcrumbs={[{ label: "Command Centre", href: "/admin" }, SETTINGS_CRUMB, { label: "Workflows", href: "/admin/settings/workflows" }, { label: workflow.name }]}
        actions={
          canEdit ? (
            <span className="flex flex-wrap gap-2">
              {!workflow.isDefault && workflow.isActive ? (
                <ActionButton action={setDefaultWorkflowAction.bind(null, { id: workflow.id })} confirm={{ title: "Make this the default workflow?", description: "Jobs without their own workflow will use it for new applications.", confirmLabel: "Make default" }}>
                  Make default
                </ActionButton>
              ) : null}
              <ResponsiveDialog title="Copy this workflow" description="Creates a copy with every stage, so you can prepare changes without affecting live pipelines." trigger={<Button variant="outline" size="sm"><Copy aria-hidden className="size-4" /> Copy</Button>}>
                <ActionForm action={duplicateWorkflowAction} hidden={{ id: workflow.id }} fields={[{ name: "name", label: "Name of the copy", required: true, defaultValue: `${workflow.name} (copy)` }]} submitLabel="Create copy" successHref="/admin/settings/workflows/{id}" />
              </ResponsiveDialog>
            </span>
          ) : null
        }
      />

      {workflow.applicationCount > 0 ? (
        <Callout tone="info" title="This workflow is in use">
          Changes to names and candidate labels show on existing applications straight away. Stage keys and categories are fixed because pipeline rules depend on them.
        </Callout>
      ) : null}

      {editingStage ? (
        <SectionCard id="stage" title={editingStage === "new" ? "Add a stage" : `Edit stage: ${editingStage.name}`} action={{ label: "Cancel", href: base, variant: "ghost" }}>
          {editingStage !== "new" ? (
            <p className="mb-4 text-sm text-muted-foreground">
              Key <code>{editingStage.key}</code> · category {humanize(editingStage.category)}
              {editingStage.isTerminal ? " · final stage" : ""} · {editingStage.applicationCount} application{editingStage.applicationCount === 1 ? "" : "s"} here now
            </p>
          ) : null}
          <ActionForm
            action={saveStageAction}
            hidden={{ workflowId: workflow.id, stageId: editingStage === "new" ? undefined : editingStage.id }}
            fields={stageFields(editingStage === "new" ? null : editingStage)}
            columns={2}
            submitLabel={editingStage === "new" ? "Add stage" : "Save stage"}
            successHref={base}
            testId="stage-form"
          />
        </SectionCard>
      ) : stageParam && canEdit ? (
        <Callout tone="warning" title="Stage not found" action={{ label: "Back to the workflow", href: base }}>It may belong to another workflow.</Callout>
      ) : null}

      <SectionCard
        title="Stages"
        description="In pipeline order. Final stages (joined, closed, rejected, withdrawn) end an application."
        action={canEdit ? { label: "Add stage", href: `${base}?stage=new#stage`, icon: <Plus aria-hidden /> } : undefined}
        flush
      >
        <ol className="divide-y" data-testid="stage-list">
          {stages.map((s, i) => (
            <li key={s.id} className="flex flex-col gap-3 px-5 py-4 md:flex-row md:items-center md:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <span className="mt-0.5 w-6 shrink-0 text-right text-sm tabular-nums text-muted-foreground">{i + 1}.</span>
                <div className="min-w-0 space-y-1">
                  <p className="flex flex-wrap items-center gap-2 font-medium text-foreground">
                    {s.name}
                    <StatusBadge tone="neutral" size="sm">{humanize(s.category)}</StatusBadge>
                    {!s.isActive ? <StatusBadge tone="warning" size="sm">Retired</StatusBadge> : null}
                    {SYSTEM_MANAGED_STAGE_KEYS.includes(s.key) ? <StatusBadge tone="info" size="sm">Automatic</StatusBadge> : null}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Candidates see “{s.candidateLabel}”
                    {s.slaDays ? ` · target ${s.slaDays} day${s.slaDays === 1 ? "" : "s"}` : ""} · {s.applicationCount} here now
                  </p>
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    {s.notifyCandidate ? <BellRing aria-hidden className="size-3" /> : <BellOff aria-hidden className="size-3" />}
                    {s.notifyCandidate ? "Candidate is notified" : "No candidate notification"} · <code>{s.key}</code>
                  </p>
                </div>
              </div>
              {canEdit ? (
                <div className="flex shrink-0 flex-wrap gap-2 pl-9 md:pl-0">
                  <ActionButton action={moveStageAction.bind(null, { workflowId: workflow.id, stageId: s.id, direction: "up" })} variant="ghost" icon={<ArrowUp aria-hidden className="size-4" />}>
                    <span className="sr-only">Move {s.name} up</span>
                  </ActionButton>
                  <ActionButton action={moveStageAction.bind(null, { workflowId: workflow.id, stageId: s.id, direction: "down" })} variant="ghost" icon={<ArrowDown aria-hidden className="size-4" />}>
                    <span className="sr-only">Move {s.name} down</span>
                  </ActionButton>
                  <Button asChild variant="outline" size="sm">
                    <Link href={`${base}?stage=${s.id}#stage`}>
                      <Pencil aria-hidden className="size-3.5" /> Edit<span className="sr-only"> {s.name}</span>
                    </Link>
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ol>
      </SectionCard>

      {canEdit ? (
        <SectionCard title="Workflow details">
          <ActionForm
            action={updateWorkflowAction}
            hidden={{ id: workflow.id }}
            fields={[
              { name: "name", label: "Name", required: true, defaultValue: workflow.name },
              { name: "description", label: "Description", kind: "textarea", optional: true, rows: 2, defaultValue: workflow.description ?? "" },
              { name: "isActive", label: "Active", kind: "checkbox", defaultValue: workflow.isActive, hint: workflow.isDefault ? "The default workflow must stay active." : undefined },
            ]}
            submitLabel="Save details"
          />
        </SectionCard>
      ) : null}
    </div>
  );
}
