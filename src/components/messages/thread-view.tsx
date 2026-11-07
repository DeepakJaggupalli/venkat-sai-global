import { FileLink } from "@/components/files";
import { UserAvatar } from "@/components/shared/avatars";
import { DateText } from "@/components/shared/date-text";
import { cn } from "@/lib/utils";
import type { ThreadMessageView } from "@/modules/operations/threads-queries";

import { DEFAULT_MESSAGES_LABELS, type MessagesLabels } from "./labels";

/**
 * Messages of a conversation, oldest first. Own messages align right (and say "You"), other people's left
 * with their name; system updates are centred; removed messages keep their place with a notice.
 */
export function ThreadView({
  messages,
  staffUserIds,
  timeZone,
  locale,
  labels = DEFAULT_MESSAGES_LABELS,
  highlightUnreadAfter,
}: {
  messages: ThreadMessageView[];
  /** Authors shown with the "Venkat Sai" badge. */
  staffUserIds?: ReadonlySet<string>;
  timeZone?: string;
  locale?: string;
  labels?: MessagesLabels;
  highlightUnreadAfter?: Date | null;
}) {
  if (!messages.length) return <p className="text-sm text-muted-foreground">{labels.noMessagesYet}</p>;
  return (
    <ol className="space-y-4" aria-label={labels.conversation} data-testid="thread-messages">
      {messages.map((m) => {
        if (m.isSystem) {
          return (
            <li key={m.id} className="flex justify-center">
              <p className="max-w-prose rounded-full bg-surface-subtle px-4 py-1.5 text-center text-xs text-muted-foreground">
                <span className="sr-only">{labels.systemMessage}: </span>
                {m.body} · <DateText value={m.createdAt} mode="datetime" timeZone={timeZone} locale={locale} />
              </p>
            </li>
          );
        }
        const isNew = Boolean(highlightUnreadAfter && !m.isOwn && m.createdAt > highlightUnreadAfter);
        const isStaff = Boolean(m.authorUserId && staffUserIds?.has(m.authorUserId));
        return (
          <li key={m.id} className={cn("flex gap-3", m.isOwn && "flex-row-reverse")} data-testid="thread-message">
            <UserAvatar name={m.isOwn ? labels.you : m.authorName} size="sm" />
            <article
              className={cn(
                "min-w-0 max-w-[85%] rounded-xl border px-4 py-3",
                m.isOwn ? "border-teal/30 bg-teal-soft" : "border-border bg-card",
                isNew && "ring-2 ring-teal/40",
              )}
              aria-label={m.isOwn ? labels.you : m.authorName}
            >
              <header className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">{m.isOwn ? labels.you : m.authorName}</span>
                {isStaff && !m.isOwn ? <span className="rounded bg-navy px-1.5 py-0.5 text-[11px] font-medium text-white">{labels.staffBadge}</span> : null}
                <DateText value={m.createdAt} mode="datetime" timeZone={timeZone} locale={locale} />
              </header>
              {m.removed ? (
                <p className="text-sm italic text-muted-foreground">{labels.removedMessage}</p>
              ) : (
                <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">{m.body}</p>
              )}
              {!m.removed && m.attachments.length ? (
                <ul className="mt-3 flex flex-col gap-2" aria-label={labels.attachments}>
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
