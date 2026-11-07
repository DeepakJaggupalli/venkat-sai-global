"use client";

import { CalendarCheck, CalendarX, CalendarClock } from "lucide-react";
import { useId, useState } from "react";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/i18n/client";

import { respondInterviewAction } from "./actions";

type Response = "confirmed" | "declined" | "reschedule_requested";

/** Confirm attendance, decline, or ask for another time (with an optional note for the organiser). */
export function InterviewResponse({ interviewId, current }: { interviewId: string; current: string }) {
  const t = useT("talent-jobs");
  const noteId = useId();
  const [open, setOpen] = useState<Response | null>(null);

  const config: Record<Response, { title: string; description: string; confirm: string; success: string }> = {
    confirmed: { title: t("interviews.confirmTitle"), description: t("interviews.confirmDescription"), confirm: t("interviews.confirm"), success: t("interviews.confirmed") },
    declined: { title: t("interviews.declineTitle"), description: t("interviews.declineDescription"), confirm: t("interviews.decline"), success: t("interviews.declined") },
    reschedule_requested: {
      title: t("interviews.rescheduleTitle"),
      description: t("interviews.rescheduleDescription"),
      confirm: t("interviews.requestReschedule"),
      success: t("interviews.rescheduleSent"),
    },
  };

  const buttons: { response: Response; label: string; icon: typeof CalendarCheck; variant: "default" | "outline" | "ghost" }[] = [
    { response: "confirmed", label: t("interviews.confirm"), icon: CalendarCheck, variant: current === "confirmed" ? "outline" : "default" },
    { response: "reschedule_requested", label: t("interviews.requestReschedule"), icon: CalendarClock, variant: "outline" },
    { response: "declined", label: t("interviews.decline"), icon: CalendarX, variant: "ghost" },
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {buttons
        .filter((b) => b.response !== current)
        .map((b) => (
          <Button key={b.response} type="button" variant={b.variant} size="sm" onClick={() => setOpen(b.response)} data-testid={`interview-${b.response}`}>
            <b.icon aria-hidden="true" />
            {b.label}
          </Button>
        ))}
      {open ? (
        <ConfirmDialog
          open
          onOpenChange={(v) => !v && setOpen(null)}
          title={config[open].title}
          description={config[open].description}
          confirmLabel={config[open].confirm}
          cancelLabel={t("common.cancel")}
          pendingLabel={t("common.working")}
          variant={open === "declined" ? "destructive" : "default"}
          successMessage={config[open].success}
          onConfirm={(formData) => {
            const note = String(formData.get("note") ?? "").trim();
            return respondInterviewAction({ interviewId, response: open, note: note || undefined });
          }}
          onSuccess={() => setOpen(null)}
        >
          <div className="space-y-1.5">
            <Label htmlFor={noteId}>
              {open === "reschedule_requested" ? t("interviews.rescheduleNote") : t("interviews.note")} <span className="text-xs font-normal text-muted-foreground">({t("form.optional")})</span>
            </Label>
            <Textarea id={noteId} name="note" rows={3} maxLength={1000} />
          </div>
        </ConfirmDialog>
      ) : null}
    </div>
  );
}
