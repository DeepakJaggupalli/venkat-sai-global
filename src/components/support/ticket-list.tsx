import { LifeBuoy } from "lucide-react";

import { DataTable } from "@/components/shared/data-table";
import { DateText } from "@/components/shared/date-text";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { TICKET_CATEGORY_LABELS } from "@/modules/operations/constants";
import type { RequesterTicketListItem } from "@/modules/operations/support-queries";

/**
 * Requester's support requests (any portal). Rows link to `${basePath}/${id}`; phones get stacked cards.
 * Only requester-safe fields are passed in (listMyTickets never selects internal data).
 */
export function TicketList({
  tickets,
  basePath,
  timeZone,
  emptyAction,
  filtered = false,
}: {
  tickets: RequesterTicketListItem[];
  basePath: string;
  timeZone?: string;
  emptyAction?: { label: string; href: string };
  filtered?: boolean;
}) {
  return (
    <DataTable
      caption="Your support requests"
      rows={tickets}
      getRowId={(t) => t.id}
      rowLink={(t) => ({ href: `${basePath}/${t.id}`, label: `Open request ${t.code}: ${t.subject}` })}
      columns={[
        {
          id: "subject",
          header: "Request",
          primary: true,
          cell: (t) => (
            <div className="min-w-0">
              <p className="truncate font-medium text-foreground">{t.subject}</p>
              <p className="text-xs text-muted-foreground">
                {t.code}
                {t.grievanceCode ? ` · Grievance ${t.grievanceCode}` : ""}
              </p>
            </div>
          ),
        },
        { id: "category", header: "Category", hideOnMobile: true, cell: (t) => TICKET_CATEGORY_LABELS[t.category] },
        { id: "status", header: "Status", cell: (t) => <StatusBadge status={t.status} domain="ticket" size="sm" /> },
        {
          id: "activity",
          header: "Last activity",
          mobileLabel: "Updated",
          nowrap: true,
          cell: (t) => <DateText value={t.lastMessageAt ?? t.createdAt} mode="datetime" timeZone={timeZone} />,
        },
      ]}
      empty={
        <EmptyState
          icon={<LifeBuoy aria-hidden="true" />}
          title={filtered ? "No requests match this view" : "No support requests yet"}
          description={filtered ? "Try another tab." : "When you ask us for help, your requests and our replies appear here."}
          primaryAction={filtered ? undefined : emptyAction}
        />
      }
    />
  );
}
