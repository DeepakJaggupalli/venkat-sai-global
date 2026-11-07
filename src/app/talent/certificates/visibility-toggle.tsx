"use client";

import { useId, useOptimistic, useTransition } from "react";
import { toast } from "sonner";

import { Switch } from "@/components/ui/switch";
import { useT } from "@/i18n/client";

import { setCertificateVerificationAction } from "./actions";

/** Lets the holder switch the public code check of one certificate on or off. */
export function VisibilityToggle({ certificateId, enabled }: { certificateId: string; enabled: boolean }) {
  const t = useT("talent-training");
  const id = useId();
  const [pending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useOptimistic(enabled);

  return (
    <div className="flex items-start gap-3">
      <Switch
        id={id}
        checked={optimistic}
        disabled={pending}
        aria-describedby={`${id}-hint`}
        onCheckedChange={(next) =>
          startTransition(async () => {
            setOptimistic(next);
            const result = await setCertificateVerificationAction({ certificateId, enabled: next });
            if (result.ok) toast.success(next ? t("certificates.publicOn") : t("certificates.publicOff"));
            else toast.error(result.error);
          })
        }
        className="mt-0.5"
      />
      <div>
        <label htmlFor={id} className="text-sm font-medium text-navy">
          {t("certificates.publicToggle")}
        </label>
        <p id={`${id}-hint`} className="text-xs text-muted-foreground" aria-live="polite">
          {optimistic ? t("certificates.publicOnHint") : t("certificates.publicOffHint")}
        </p>
      </div>
    </div>
  );
}
