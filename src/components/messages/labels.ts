/**
 * Copy for the messaging components (client-safe). Business portals use the English defaults; the
 * People Portal passes translations from its `talent-messages` catalogue.
 */
export type MessagesLabels = {
  title: string;
  description: string;
  listCaption: string;
  emptyTitle: string;
  emptyDescription: string;
  emptyFilteredTitle: string;
  tabAll: string;
  tabUnread: string;
  tabClosed: string;
  unread_one: string;
  unread_other: string;
  muted: string;
  closed: string;
  open: string;
  lastActivity: string;
  backToMessages: string;
  conversation: string;
  participants: string;
  staffBadge: string;
  you: string;
  removedMessage: string;
  systemMessage: string;
  attachments: string;
  composerLabel: string;
  composerHint: string;
  composerAttachments: string;
  send: string;
  sending: string;
  sent: string;
  closedNotice: string;
  cannotPostNotice: string;
  mute: string;
  unmute: string;
  closeConversation: string;
  closeConfirmTitle: string;
  closeConfirmDescription: string;
  reopenConversation: string;
  newConversation: string;
  noMessagesYet: string;
  about: string;
};

export const DEFAULT_MESSAGES_LABELS: MessagesLabels = {
  title: "Messages",
  description: "Conversations with the Venkat Sai team.",
  listCaption: "Conversations",
  emptyTitle: "No conversations yet",
  emptyDescription: "Messages between you and the Venkat Sai team appear here.",
  emptyFilteredTitle: "No conversations in this view",
  tabAll: "All",
  tabUnread: "Unread",
  tabClosed: "Closed",
  unread_one: "{count} unread",
  unread_other: "{count} unread",
  muted: "Muted",
  closed: "Closed",
  open: "Open",
  lastActivity: "Last activity",
  backToMessages: "Back to messages",
  conversation: "Conversation",
  participants: "People in this conversation",
  staffBadge: "Venkat Sai",
  you: "You",
  removedMessage: "This message was removed.",
  systemMessage: "Update",
  attachments: "Attachments",
  composerLabel: "Write a message",
  composerHint: "Do not share passwords, one-time codes or bank details.",
  composerAttachments: "Attach files (optional)",
  send: "Send",
  sending: "Sending…",
  sent: "Message sent",
  closedNotice: "This conversation is closed.",
  cannotPostNotice: "You can read this conversation but cannot reply to it.",
  mute: "Mute notifications",
  unmute: "Unmute notifications",
  closeConversation: "Close conversation",
  closeConfirmTitle: "Close this conversation?",
  closeConfirmDescription: "Nobody can reply until Venkat Sai staff reopen it.",
  reopenConversation: "Reopen conversation",
  newConversation: "New conversation",
  noMessagesYet: "No messages yet.",
  about: "About",
};

export function formatLabel(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => (vars[k] !== undefined ? String(vars[k]) : `{${k}}`));
}

export function unreadLabel(labels: Pick<MessagesLabels, "unread_one" | "unread_other">, count: number): string {
  return formatLabel(count === 1 ? labels.unread_one : labels.unread_other, { count });
}
