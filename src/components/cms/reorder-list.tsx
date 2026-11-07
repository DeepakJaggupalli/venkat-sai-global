"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import type { CmsCollection, CmsEntryStatus } from "@/db/schema";
import { reorderEntriesAction } from "@/modules/content/actions";
import { CMS_ENTRY_STATUS_LABELS } from "@/modules/content/constants";

import { moveItem } from "./field-utils";
import { SortableRows } from "./sortable-rows";

type Item = { id: string; title: string; status: CmsEntryStatus };

/** Manual order of a collection on the website: drag and drop, keyboard, or move buttons; saved in one go. */
export function ReorderList({ collection, items: initial, doneHref }: { collection: CmsCollection; items: Item[]; doneHref: string }) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [pending, startTransition] = useTransition();
  const changed = items.some((it, i) => it.id !== initial[i]?.id);

  function save() {
    startTransition(async () => {
      const result = await reorderEntriesAction({ collection, ids: items.map((i) => i.id) });
      if (result.ok) {
        toast.success(result.message ?? "Order saved.");
        router.push(doneHref);
        router.refresh();
      } else toast.error(result.error);
    });
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground" id="reorder-help">
        Drag the handle, or focus it and press Space, then use the arrow keys. The move buttons do the same. The new order is live on the website as soon as you save.
      </p>
      <SortableRows
        ids={items.map((i) => i.id)}
        labels={items.map((i) => i.title)}
        listLabel="entries"
        onMove={(from, to) => setItems((prev) => moveItem(prev, from, to))}
        renderRow={(index, c) => {
          const item = items[index]!;
          return (
            <div className="flex items-center gap-2 rounded-lg border bg-card px-2 py-2">
              {c.handle}
              <span className="w-8 shrink-0 text-center text-sm tabular-nums text-muted-foreground">{index + 1}</span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{item.title}</span>
              <span className="hidden sm:inline">
                <StatusBadge tone={item.status === "published" ? "success" : "neutral"} size="sm">
                  {CMS_ENTRY_STATUS_LABELS[item.status]}
                </StatusBadge>
              </span>
              {c.moveButtons}
            </div>
          );
        }}
      />
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={() => router.push(doneHref)}>
          Cancel
        </Button>
        <Button type="button" onClick={save} disabled={!changed || pending}>
          {pending ? "Saving…" : "Save order"}
        </Button>
      </div>
    </div>
  );
}
