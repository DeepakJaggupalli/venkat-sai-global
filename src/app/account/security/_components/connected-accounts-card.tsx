"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import { buttonVariants } from "@/components/ui/button";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { disconnectGoogleAction } from "@/modules/identity/actions";

import { ConfirmButton } from "./confirm-button";

/** Google sign-in connection: connect (via /auth/google?mode=link) or disconnect. */
export function ConnectedAccountsCard({
  google,
}: {
  google: { available: boolean; linked: boolean; email: string | null; linkedLabel: string | null; canDisconnect: boolean };
}) {
  const t = useT("auth");
  const [pending, startTransition] = useTransition();

  const disconnect = () =>
    startTransition(async () => {
      const result = await disconnectGoogleAction({});
      if (result.ok) toast.success(result.message ?? t("security.connected.disconnectedDone"));
      else toast.error(result.error);
    });

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-0.5">
          <h3 className="text-sm font-medium">Google</h3>
          <p className="text-sm break-all text-muted-foreground">
            {google.linked ? t("security.connected.linkedAs", { email: google.email ?? "—" }) : t("security.connected.notLinked")}
          </p>
          {google.linked && google.linkedLabel ? <p className="text-xs text-muted-foreground">{t("security.connected.linkedOn", { date: google.linkedLabel })}</p> : null}
        </div>
        {google.linked ? (
          <ConfirmButton
            label={t("security.connected.disconnect")}
            title={t("security.connected.disconnectTitle")}
            description={t("security.connected.disconnectDescription")}
            confirmLabel={t("security.connected.disconnect")}
            cancelLabel={t("common.cancel")}
            disabled={!google.canDisconnect}
            pending={pending}
            onConfirm={disconnect}
          />
        ) : google.available ? (
          // Plain link: /auth/google is a route handler and must not be prefetched.
          <a href="/auth/google?mode=link" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-9")}>
            {t("security.connected.connect")}
          </a>
        ) : null}
      </div>
      {google.linked && !google.canDisconnect ? <p className="text-xs text-muted-foreground">{t("security.connected.disconnectBlocked")}</p> : null}
    </div>
  );
}
