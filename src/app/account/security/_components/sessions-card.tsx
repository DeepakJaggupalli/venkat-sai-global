"use client";

import { HelpCircle, Monitor, Smartphone, Tablet } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";

import { useT } from "@/i18n/client";
import { revokeSessionAction, signOutEverywhereAction } from "@/modules/identity/actions";

import { ConfirmButton } from "./confirm-button";

export type SessionView = {
  id: string;
  current: boolean;
  deviceType: "mobile" | "tablet" | "desktop" | "bot" | "unknown";
  label: string;
  createdLabel: string;
  lastSeenLabel: string;
};

function DeviceIcon({ type }: { type: SessionView["deviceType"] }) {
  const Icon = type === "mobile" ? Smartphone : type === "tablet" ? Tablet : type === "desktop" ? Monitor : HelpCircle;
  return (
    <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-surface-subtle">
      <Icon className="size-5 text-navy" aria-hidden />
    </span>
  );
}

/** Active sessions with per-device sign-out and "sign out everywhere". */
export function SessionsCard({ sessions }: { sessions: SessionView[] }) {
  const t = useT("auth");
  const [pending, startTransition] = useTransition();
  const others = sessions.filter((session) => !session.current);

  const revoke = (sessionId: string) =>
    startTransition(async () => {
      const result = await revokeSessionAction({ sessionId });
      if (result.ok) toast.success(result.message ?? t("security.sessions.revokedDone"));
      else toast.error(result.error);
    });

  const signOutAll = (includeCurrent: boolean) =>
    startTransition(async () => {
      const result = await signOutEverywhereAction({ includeCurrent });
      if (result.ok) toast.success(result.message ?? t("security.sessions.othersSignedOut"));
      else toast.error(result.error);
    });

  return (
    <div className="space-y-4">
      {sessions.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("security.sessions.empty")}</p>
      ) : (
        <ul className="divide-y rounded-xl border" aria-busy={pending || undefined}>
          {sessions.map((session) => (
            <li key={session.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <DeviceIcon type={session.deviceType} />
                <div className="min-w-0 space-y-0.5">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    {session.label}
                    {session.current ? (
                      <span className="rounded-full bg-teal-soft px-2 py-0.5 text-xs font-semibold text-accent-foreground">{t("security.sessions.thisDevice")}</span>
                    ) : null}
                  </p>
                  <p className="text-xs text-muted-foreground">{t("security.sessions.signedIn", { date: session.createdLabel })}</p>
                  <p className="text-xs text-muted-foreground">{t("security.sessions.lastActive", { time: session.lastSeenLabel })}</p>
                </div>
              </div>
              {session.current ? null : (
                <ConfirmButton
                  label={t("security.sessions.revoke")}
                  title={t("security.sessions.revokeTitle")}
                  description={t("security.sessions.revokeDescription", { device: session.label })}
                  confirmLabel={t("security.sessions.revoke")}
                  cancelLabel={t("common.cancel")}
                  pending={pending}
                  onConfirm={() => revoke(session.id)}
                />
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        {others.length > 0 ? (
          <ConfirmButton
            label={t("security.sessions.signOutOthers")}
            title={t("security.sessions.signOutOthersTitle")}
            description={t("security.sessions.signOutOthersDescription")}
            confirmLabel={t("security.sessions.signOutOthers")}
            cancelLabel={t("common.cancel")}
            pending={pending}
            onConfirm={() => signOutAll(false)}
          />
        ) : null}
        <ConfirmButton
          destructive
          label={t("security.sessions.signOutEverywhere")}
          title={t("security.sessions.signOutEverywhereTitle")}
          description={t("security.sessions.signOutEverywhereDescription")}
          confirmLabel={t("security.sessions.signOutEverywhere")}
          cancelLabel={t("common.cancel")}
          pending={pending}
          onConfirm={() => signOutAll(true)}
        />
      </div>
    </div>
  );
}
