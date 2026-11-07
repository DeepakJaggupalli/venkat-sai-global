import { Lock } from "lucide-react";

import { FileLink } from "@/components/files";
import { DateText } from "@/components/shared/date-text";
import { EmptyState } from "@/components/shared/empty-state";
import { UserAvatar } from "@/components/shared/avatars";
import { cn } from "@/lib/utils";
import type { TicketMessageView } from "@/modules/operations/support-queries";

/**
 * Conversation of a support request, oldest first. Requester views never receive internal notes (the
 * module never selects them); in the staff view internal notes are marked with a lock and a label,
 * not colour alone.
 */
export function TicketThread({ messages, timeZone, viewer }: { messages: TicketMessageView[]; timeZone?: string; viewer: "requester" | "staff" }) {
  if (!messages.length) return <EmptyState size="sm" title="No messages yet" description="Messages about this request will appear here." />;
  return (
    <ol className="space-y-4" aria-label="Conversation">
      {messages.map((m) => {
        const fromSupport = m.authorType !== "requester";
        return (
          <li key={m.id} data-testid="ticket-message" className={cn("flex gap-3", m.isOwn && "sm:flex-row-reverse")}>
            <UserAvatar name={m.authorLabel} size="sm" />
            <article
              className={cn(
                "min-w-0 flex-1 rounded-xl border px-4 py-3 sm:max-w-[85%]",
                m.isInternal ? "border-dashed border-gold bg-gold-soft" : fromSupport ? "border-border bg-card" : "border-teal/30 bg-teal-soft",
              )}
              aria-label={m.isInternal ? `Internal note by ${m.authorLabel}` : `Message from ${m.authorLabel}`}
            >
              <header className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">{m.authorLabel}</span>
                {m.authorType === "system" ? <span>System</span> : null}
                {m.isInternal ? (
                  <span className="inline-flex items-center gap-1 font-medium text-gold-strong">
                    <Lock className="size-3" aria-hidden="true" />
                    Internal note{viewer === "staff" ? " (not visible to the requester)" : ""}
                  </span>
                ) : null}
                <DateText value={m.createdAt} mode="datetime" timeZone={timeZone} />
              </header>
              <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">{m.body}</p>
              {m.attachments.length ? (
                <ul className="mt-3 flex flex-col gap-2" aria-label="Attachments">
                  {m.attachments.map((file) => (
                    <li key={file.id}>
                      <FileLink file={file} />
                    </li>
                  ))}
                </ul>
              ) : null}
            </article>
          </li>
        );
      })}
    </ol>
  );
}
