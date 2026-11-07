"use client";

import { Archive, Trash2 } from "lucide-react";
import { useState } from "react";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { CopyButton } from "@/components/shared/copy-button";
import { MaskedValue } from "@/components/shared/masked-value";
import { ResponsiveDialog } from "@/components/shared/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function ConfirmDialogDemo() {
  return (
    <div className="flex flex-wrap gap-3">
      <ConfirmDialog
        trigger={
          <Button variant="outline">
            <Archive aria-hidden="true" /> Archive sample job
          </Button>
        }
        title="Archive this sample job?"
        description="It will be hidden from candidates. You can restore it later. (Sample — nothing changes.)"
        confirmLabel="Archive"
        onConfirm={async () => {
          await wait(800);
          return { ok: true, message: "Sample job archived (demo)" };
        }}
      />
      <ConfirmDialog
        trigger={
          <Button variant="outline" className="text-danger">
            <Trash2 aria-hidden="true" /> Reject with reason
          </Button>
        }
        title="Reject Sample Candidate A?"
        description="The reason is shared with your team only. This demo always fails to show the error state."
        confirmLabel="Reject"
        variant="destructive"
        onConfirm={async (formData) => {
          await wait(800);
          const reason = String(formData.get("reason") ?? "").trim();
          if (!reason) return { ok: false, error: "Enter a reason before rejecting." };
          return { ok: false, error: "Demo: the server refused this change. Nothing was saved." };
        }}
      >
        <div className="grid gap-1.5">
          <Label htmlFor="demo-reject-reason">Reason</Label>
          <Textarea id="demo-reject-reason" name="reason" rows={3} placeholder="Sample reason" />
        </div>
      </ConfirmDialog>
    </div>
  );
}

export function MaskedValueDemo() {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <MaskedValue
        masked="s***@example.com"
        label="email address"
        kind="email"
        onReveal={async () => {
          await wait(600);
          return { ok: true, data: { value: "sample.candidate@example.com" } };
        }}
      />
      <MaskedValue
        masked="+91 ******0000"
        label="phone number"
        kind="phone"
        onReveal={async () => {
          await wait(600);
          return { ok: false, error: "Demo: you need consent from the candidate to view this." };
        }}
      />
    </div>
  );
}

export function CopyButtonDemo() {
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <code className="rounded bg-secondary px-2 py-1">SAMPLE-CODE-0001</code>
      <CopyButton value="SAMPLE-CODE-0001" label="sample code" />
      <CopyButton value="SAMPLE-CODE-0001" label="sample code" size="sm" variant="outline" showLabel />
    </div>
  );
}

export function ResponsiveDialogDemo() {
  const [open, setOpen] = useState(false);
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={setOpen}
      trigger={<Button variant="outline">Open responsive dialog</Button>}
      title="Add a sample note"
      description="A dialog on desktop, a bottom sheet on phones."
      footer={
        <>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={() => setOpen(false)}>Save note</Button>
        </>
      }
    >
      <div className="grid gap-1.5">
        <Label htmlFor="demo-note">Note</Label>
        <Textarea id="demo-note" rows={4} placeholder="Sample note text" />
      </div>
    </ResponsiveDialog>
  );
}
