import type { Metadata } from "next";
import { Workflow } from "lucide-react";

import { ActionButton } from "@/components/admin/action-button";
import { DataTable } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { requireStaff, staffCan } from "@/modules/identity/authz";

import { SETTINGS_CRUMB, SettingsNav } from "../_components/settings-nav";
import { setDefaultWorkflowAction } from "./actions";
import { listPlatformWorkflows } from "./_lib/workflows";

export const metadata: Metadata = { title: "Application workflows" };

export default async function WorkflowsPage() {
  const ctx = await requireStaff("settings.view");
  const canEdit = staffCan(ctx, "settings.manage");
  const workflows = await listPlatformWorkflows();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Application workflows"
        description="The stages every application moves through. Staff and employers see pipeline names; candidates see the candidate label in their language."
        breadcrumbs={[{ label: "Command Centre", href: "/admin" }, SETTINGS_CRUMB, { label: "Workflows" }]}
      />
      <SettingsNav />
      <DataTable
        caption="Platform workflows"
        rows={workflows}
        getRowId={(w) => w.id}
        rowLink={(w) => ({ href: `/admin/settings/workflows/${w.id}`, label: `Open workflow ${w.name}` })}
        columns={[
          {
            id: "name",
            header: "Workflow",
            primary: true,
            cell: (w) => (
              <div className="min-w-0">
                <p className="font-medium text-foreground">{w.name}</p>
                <p className="text-xs text-muted-foreground">
                  <code>{w.key}</code>
                  {w.description ? ` · ${w.description}` : ""}
                </p>
              </div>
            ),
          },
          {
            id: "status",
            header: "Status",
            cell: (w) => (
              <span className="flex flex-wrap gap-1">
                {w.isDefault ? <StatusBadge tone="brand" size="sm">Default</StatusBadge> : null}
                <StatusBadge tone={w.isActive ? "success" : "neutral"} size="sm">{w.isActive ? "Active" : "Inactive"}</StatusBadge>
              </span>
            ),
          },
          { id: "stages", header: "Stages", align: "right", cell: (w) => w.stageCount },
          { id: "apps", header: "Applications", align: "right", cell: (w) => w.applicationCount },
          ...(canEdit
            ? [
                {
                  id: "actions",
                  header: "Actions",
                  align: "right" as const,
                  cell: (w: (typeof workflows)[number]) =>
                    !w.isDefault && w.isActive ? (
                      <ActionButton
                        action={setDefaultWorkflowAction.bind(null, { id: w.id })}
                        confirm={{ title: `Make “${w.name}” the default?`, description: "Jobs without their own workflow will use it for new applications. Existing applications keep their workflow.", confirmLabel: "Make default" }}
                      >
                        Make default<span className="sr-only"> {w.name}</span>
                      </ActionButton>
                    ) : null,
                },
              ]
            : []),
        ]}
        empty={<EmptyState icon={<Workflow />} title="No workflows yet" description="Run the database seed to install the Standard recruitment workflow." />}
      />
      {!canEdit ? <p className="text-sm text-muted-foreground">Editing workflows needs the “Edit general settings” permission.</p> : null}
    </div>
  );
}
