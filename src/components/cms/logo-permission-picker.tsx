"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { setEntryLogoPermissionAction } from "@/modules/content/actions";

/** Link a client logo entry to an approved, unexpired logo permission (required to publish it). */
export function LogoPermissionPicker({
  entryId,
  currentId,
  options,
  disabled,
}: {
  entryId: string;
  currentId: string | null;
  options: { id: string; organizationName: string; expiresAt: string | null }[];
  disabled?: boolean;
}) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const router = useRouter();
  const [value, setValue] = useState(currentId ?? "");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function save() {
    startTransition(async () => {
      const result = await setEntryLogoPermissionAction({ id: entryId, logoPermissionId: value || null });
      if (result.ok) {
        setError(null);
        toast.success(result.message ?? "Saved.");
        router.refresh();
      } else setError(result.error);
    });
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={`lp-${id}`}>Approved permission</Label>
      <select
        id={`lp-${id}`}
        value={value}
        disabled={disabled}
        onChange={(e) => setValue(e.target.value)}
        aria-describedby={error ? `lp-${id}-err` : undefined}
        className="h-9 w-full rounded-md border bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <option value="">No permission linked</option>
        {currentId && !options.some((o) => o.id === currentId) && <option value={currentId}>Current permission (no longer usable)</option>}
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.organizationName}
            {o.expiresAt ? ` · until ${o.expiresAt}` : ""}
          </option>
        ))}
      </select>
      {error && (
        <p id={`lp-${id}-err`} className="text-sm text-danger-strong" role="alert">
          {error}
        </p>
      )}
      {!disabled && (
        <Button type="button" size="sm" variant="outline" disabled={pending || value === (currentId ?? "")} onClick={save}>
          {pending ? "Saving…" : "Save link"}
        </Button>
      )}
    </div>
  );
}
