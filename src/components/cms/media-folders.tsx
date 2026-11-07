"use client";

import { Folder, FolderOpen, FolderPlus, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { FormErrorAlert, FormField, SubmitButton, useActionToast } from "@/components/shared/form";
import { ResponsiveDialog } from "@/components/shared/responsive-dialog";
import { SimpleSelect } from "@/components/shared/selects";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createMediaFolderAction, deleteMediaFolderAction, renameMediaFolderAction } from "@/modules/content/actions";
import { cn } from "@/lib/utils";

const INDENT = ["pl-0", "pl-3", "pl-6", "pl-9", "pl-12", "pl-14", "pl-16"] as const;

export type FolderItem = { id: string; name: string; parentId: string | null; assetCount: number; childCount: number };

function tree(folders: FolderItem[]): { folder: FolderItem; depth: number }[] {
  const byParent = new Map<string | null, FolderItem[]>();
  for (const f of folders) {
    const key = f.parentId && folders.some((p) => p.id === f.parentId) ? f.parentId : null;
    byParent.set(key, [...(byParent.get(key) ?? []), f]);
  }
  const out: { folder: FolderItem; depth: number }[] = [];
  const walk = (parent: string | null, depth: number) => {
    for (const f of byParent.get(parent) ?? []) {
      out.push({ folder: f, depth });
      if (depth < 6) walk(f.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

/** Folder navigation for the media library, with create / rename / delete for media managers. */
export function MediaFolders({ folders, active, hrefFor, canManage }: { folders: FolderItem[]; active: string | null; hrefFor: Record<string, string>; canManage: boolean }) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [renaming, setRenaming] = useState<FolderItem | null>(null);
  const rows = tree(folders);
  const linkClass = (on: boolean) =>
    cn(
      "flex min-h-8 min-w-0 flex-1 items-center gap-2 rounded-md px-2 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
      on ? "bg-teal-soft font-medium text-foreground" : "hover:bg-muted",
    );

  return (
    <nav aria-label="Media folders" className="space-y-1">
      <Link href={hrefFor.all!} className={linkClass(active === null)} aria-current={active === null ? "page" : undefined}>
        <FolderOpen className="size-4 shrink-0" aria-hidden />
        All media
      </Link>
      <Link href={hrefFor.unfiled!} className={linkClass(active === "unfiled")} aria-current={active === "unfiled" ? "page" : undefined}>
        <Folder className="size-4 shrink-0" aria-hidden />
        Unfiled
      </Link>
      <ul className="space-y-0.5">
        {rows.map(({ folder, depth }) => (
          <li key={folder.id} className={cn("group flex items-center gap-0.5", INDENT[Math.min(depth, INDENT.length - 1)])}>
            <Link href={hrefFor[folder.id]!} className={linkClass(active === folder.id)} aria-current={active === folder.id ? "page" : undefined}>
              <Folder className="size-4 shrink-0" aria-hidden />
              <span className="truncate">{folder.name}</span>
              <span className="ml-auto text-xs tabular-nums text-muted-foreground">{folder.assetCount}</span>
            </Link>
            {canManage && (
              <span className="flex shrink-0">
                <Button type="button" variant="ghost" size="icon-xs" aria-label={`Rename folder ${folder.name}`} onClick={() => setRenaming(folder)}>
                  <Pencil aria-hidden />
                </Button>
                <ConfirmDialog
                  trigger={
                    <Button type="button" variant="ghost" size="icon-xs" aria-label={`Delete folder ${folder.name}`} disabled={folder.childCount > 0}>
                      <Trash2 aria-hidden />
                    </Button>
                  }
                  title={`Delete the folder “${folder.name}”?`}
                  description="Its media items are kept and become unfiled."
                  confirmLabel="Delete folder"
                  variant="destructive"
                  onConfirm={() => deleteMediaFolderAction({ id: folder.id })}
                  onSuccess={() => router.push(hrefFor.all!)}
                />
              </span>
            )}
          </li>
        ))}
      </ul>
      {canManage && (
        <Button type="button" variant="ghost" size="sm" className="mt-2 w-full justify-start" onClick={() => setCreateOpen(true)}>
          <FolderPlus aria-hidden />
          New folder
        </Button>
      )}
      <ResponsiveDialog open={createOpen} onOpenChange={setCreateOpen} title="New folder" size="sm">
        <CreateFolderForm folders={folders} parentId={active && active !== "unfiled" ? active : null} onDone={() => setCreateOpen(false)} />
      </ResponsiveDialog>
      <ResponsiveDialog open={Boolean(renaming)} onOpenChange={(o) => !o && setRenaming(null)} title="Rename folder" size="sm">
        {renaming && <RenameFolderForm folder={renaming} onDone={() => setRenaming(null)} />}
      </ResponsiveDialog>
    </nav>
  );
}

function CreateFolderForm({ folders, parentId, onDone }: { folders: FolderItem[]; parentId: string | null; onDone: () => void }) {
  const router = useRouter();
  const [state, formAction] = useActionState(createMediaFolderAction, null);
  useActionToast(state, {
    onSuccess: () => {
      onDone();
      router.refresh();
    },
  });
  return (
    <form action={formAction} noValidate className="space-y-4">
      <FormErrorAlert state={state} />
      <FormField label="Folder name" name="name" required state={state}>
        <Input maxLength={120} autoFocus />
      </FormField>
      <FormField label="Inside" name="parentId" optional state={state}>
        {(control) => (
          <SimpleSelect {...control} name="parentId" options={folders.map((f) => ({ value: f.id, label: f.name }))} defaultValue={parentId ?? ""} allowClear clearLabel="Top level" placeholder="Top level" />
        )}
      </FormField>
      <SubmitButton pendingLabel="Creating…">Create folder</SubmitButton>
    </form>
  );
}

function RenameFolderForm({ folder, onDone }: { folder: FolderItem; onDone: () => void }) {
  const router = useRouter();
  const [state, formAction] = useActionState(renameMediaFolderAction, null);
  useActionToast(state, {
    onSuccess: () => {
      onDone();
      router.refresh();
    },
  });
  return (
    <form action={formAction} noValidate className="space-y-4">
      <input type="hidden" name="id" value={folder.id} />
      <FormErrorAlert state={state} />
      <FormField label="Folder name" name="name" required state={state}>
        <Input maxLength={120} defaultValue={folder.name} autoFocus />
      </FormField>
      <SubmitButton pendingLabel="Saving…">Rename</SubmitButton>
    </form>
  );
}
