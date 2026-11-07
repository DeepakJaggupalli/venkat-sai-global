import "server-only";

import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { PortalBreadcrumb } from "@/components/layout/portal-breadcrumb";
import { Callout } from "@/components/shared/callout";
import { DateText } from "@/components/shared/date-text";
import { KeyValueList } from "@/components/shared/key-value-list";
import { LinkTabs } from "@/components/shared/link-tabs";
import { PageHeader } from "@/components/shared/page-header";
import { Pagination } from "@/components/shared/pagination";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import type { SelectOption } from "@/components/shared/types";
import { env } from "@/lib/env";
import { parsePage, sp, type SearchParams } from "@/lib/http";
import type { SessionUser } from "@/modules/identity/session";
import { GRIEVANCE_TYPE_LABELS, REQUESTER_PRIORITIES, TICKET_CATEGORY_LABELS, TICKET_PRIORITY_LABELS } from "@/modules/operations/constants";
import { getMyTicket, listMyTickets } from "@/modules/operations/queries";
import type { SupportTicketCategory } from "@/db/schema/operations";
import { getSettings } from "@/modules/settings";

import { NewTicketForm } from "./new-ticket-form";
import { CloseTicketButton, TicketRatingForm } from "./ticket-requester-actions";
import { TicketList } from "./ticket-list";
import { TicketReplyForm } from "./ticket-reply-form";
import { TicketThread } from "./ticket-thread";

/**
 * Support pages shared by the People, Employer, Partner and Institution portals. The page calls its own
 * guard first and passes the signed-in user (and the active organisation for organisation portals);
 * every read here is scoped to that requester by the operations module. English-only by design.
 */

export type SupportPortal = "talent" | "employer" | "recruiter" | "institution";

const PORTAL_CATEGORIES: Record<SupportPortal, SupportTicketCategory[]> = {
  talent: ["candidate_support", "application_issue", "documentation_issue", "training_support", "account_issue", "overseas_employment_issue", "privacy_request", "complaint", "grievance", "other"],
  employer: ["employer_support", "payment_issue", "documentation_issue", "account_issue", "privacy_request", "complaint", "grievance", "other"],
  recruiter: ["recruiter_support", "payment_issue", "documentation_issue", "account_issue", "privacy_request", "complaint", "grievance", "other"],
  institution: ["training_support", "payment_issue", "documentation_issue", "account_issue", "privacy_request", "complaint", "grievance", "other"],
};

const PORTAL_NAMES: Record<SupportPortal, string> = { talent: "People Portal", employer: "Employer Portal", recruiter: "Partner Portal", institution: "Institution Portal" };

export const supportBasePath = (portal: SupportPortal): string => `/${portal}/support`;

function options(portal: SupportPortal) {
  const categories: SelectOption[] = PORTAL_CATEGORIES[portal].map((value) => ({ value, label: TICKET_CATEGORY_LABELS[value] }));
  const grievanceTypes: SelectOption[] = Object.entries(GRIEVANCE_TYPE_LABELS).map(([value, label]) => ({ value, label }));
  const priorities: SelectOption[] = REQUESTER_PRIORITIES.map((value) => ({ value, label: TICKET_PRIORITY_LABELS[value] }));
  return { categories, grievanceTypes, priorities };
}

async function GrievanceInfo({ portal }: { portal: SupportPortal }) {
  const s = await getSettings(["privacy.grievance_ack_hours", "privacy.grievance_resolution_days"]);
  return (
    <SectionCard title="How we handle your request" headingLevel="h2">
      <div className="space-y-3 text-sm text-muted-foreground">
        <p>We reply here and by email. You can add details or files to an open request at any time.</p>
        <p>
          A <strong className="text-foreground">formal grievance</strong> is acknowledged within {String(s["privacy.grievance_ack_hours"])} hours and resolved within{" "}
          {String(s["privacy.grievance_resolution_days"])} days. Choose “Grievance (formal)” as the category to raise one.
        </p>
        {portal === "talent" ? <p>Venkat Sai Global never charges candidates to apply for a job, be interviewed or be placed. If anyone asks you for money in our name, tell us here.</p> : null}
        <p>
          Read the{" "}
          <Link className="font-medium text-teal-strong underline underline-offset-4" href="/grievance">
            grievance redressal policy
          </Link>
          .
        </p>
      </div>
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

export async function SupportListView({ portal, user, organizationId, searchParams }: { portal: SupportPortal; user: SessionUser; organizationId?: string; searchParams: SearchParams }) {
  const base = supportBasePath(portal);
  // Deep link from an application page: /talent/support?application=<code> opens a prefilled request.
  const application = sp(searchParams, "application");
  if (application) redirect(`${base}/new?application=${encodeURIComponent(application.slice(0, 40))}`);
  const view = sp(searchParams, "status");
  const status = view === "closed" ? "closed" : view === "all" ? undefined : "open";
  const page = parsePage(searchParams, { defaultSize: 20, maxSize: 50 });
  const result = await listMyTickets(user, { status, organizationId }, page);
  const timeZone = user.timezone ?? env().DEFAULT_TIMEZONE;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Support"
        description={`Ask the Venkat Sai team for help with the ${PORTAL_NAMES[portal]} and follow our replies.`}
        actions={[{ label: "New request", href: `${base}/new` }]}
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-4">
          <LinkTabs
            label="Request status"
            items={[
              { href: base, label: "Open", match: "exact" },
              { href: `${base}?status=closed`, label: "Resolved and closed" },
              { href: `${base}?status=all`, label: "All" },
            ]}
            activeHref={view === "closed" ? `${base}?status=closed` : view === "all" ? `${base}?status=all` : base}
          />
          <TicketList tickets={result.items} basePath={base} timeZone={timeZone} filtered={status !== "open" || page.page > 1} emptyAction={{ label: "New request", href: `${base}/new` }} />
          <Pagination pathname={base} searchParams={searchParams} page={result.page} pageCount={result.pageCount} total={result.total} pageSize={result.pageSize} itemLabel="requests" />
        </div>
        <GrievanceInfo portal={portal} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// New
// ---------------------------------------------------------------------------

export async function SupportNewView({ portal, organizationId, searchParams }: { portal: SupportPortal; organizationId?: string; searchParams: SearchParams }) {
  const base = supportBasePath(portal);
  const { categories, grievanceTypes, priorities } = options(portal);
  // Deep links: ?application=<code> (People Portal application page), ?category=<value>, ?subject=<text>.
  const application = sp(searchParams, "application")?.slice(0, 40);
  const requestedCategory = sp(searchParams, "category");
  const defaultCategory = application ? "application_issue" : categories.some((c) => c.value === requestedCategory) ? requestedCategory : undefined;
  const defaultSubject = application ? `Application ${application}` : sp(searchParams, "subject")?.slice(0, 200);

  return (
    <div className="space-y-6">
      <PortalBreadcrumb items={[{ label: "Support", href: base }, { label: "New request" }]} />
      <PageHeader title="New support request" description="Tell us what you need. We usually reply within one working day." backLink={{ href: base, label: "Back to support" }} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <SectionCard title="Your request" headingLevel="h2">
          <NewTicketForm
            portal={portal}
            basePath={base}
            categories={categories}
            grievanceTypes={grievanceTypes}
            priorities={priorities}
            defaultCategory={defaultCategory}
            defaultSubject={defaultSubject}
            organizationId={organizationId}
          />
        </SectionCard>
        <GrievanceInfo portal={portal} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------------

export async function SupportDetailView({ portal, user, ticketId, organizationId }: { portal: SupportPortal; user: SessionUser; ticketId: string; organizationId?: string }) {
  const base = supportBasePath(portal);
  const ticket = await getMyTicket(user, ticketId);
  if (!ticket) notFound();
  const timeZone = user.timezone ?? env().DEFAULT_TIMEZONE;
  const open = ticket.status !== "resolved" && ticket.status !== "closed";

  return (
    <div className="space-y-6">
      <PortalBreadcrumb items={[{ label: "Support", href: base }, { label: ticket.code }]} />
      <PageHeader
        eyebrow={ticket.grievanceCode ? `${ticket.code} · Grievance ${ticket.grievanceCode}` : ticket.code}
        title={ticket.subject}
        status={<StatusBadge status={ticket.status} domain="ticket" />}
        backLink={{ href: base, label: "Back to support" }}
        actions={open ? <CloseTicketButton ticketId={ticket.id} /> : undefined}
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-6">
          {ticket.resolution && (ticket.status === "resolved" || ticket.status === "closed") ? (
            <Callout tone="success" title="Resolution">
              <p className="whitespace-pre-wrap">{ticket.resolution}</p>
            </Callout>
          ) : null}
          <SectionCard title="Conversation" headingLevel="h2">
            <TicketThread messages={ticket.messages} timeZone={timeZone} viewer="requester" />
          </SectionCard>
          {ticket.canReply ? (
            <SectionCard title={ticket.status === "resolved" ? "Still need help?" : "Reply"} description={ticket.status === "resolved" ? "Replying reopens the request." : undefined} headingLevel="h2">
              <TicketReplyForm ticketId={ticket.id} mode="requester" organizationId={organizationId} />
            </SectionCard>
          ) : (
            <Callout tone="neutral" title="This request is closed">
              Raise a new request if you need more help.
            </Callout>
          )}
          {ticket.canRate ? (
            <SectionCard title="Rate our help" headingLevel="h2">
              {ticket.satisfactionRating ? (
                <p className="text-sm text-muted-foreground" data-testid="ticket-rated">
                  You rated this request {ticket.satisfactionRating} out of 5. Thank you.
                </p>
              ) : (
                <TicketRatingForm ticketId={ticket.id} />
              )}
            </SectionCard>
          ) : null}
        </div>
        <SectionCard title="Details" headingLevel="h2">
          <KeyValueList
            columns={1}
            dense
            items={[
              { label: "Reference", value: ticket.code },
              { label: "Category", value: TICKET_CATEGORY_LABELS[ticket.category] },
              ...(ticket.isGrievance && ticket.grievanceType ? [{ label: "Grievance type", value: GRIEVANCE_TYPE_LABELS[ticket.grievanceType] }] : []),
              { label: "Priority", value: TICKET_PRIORITY_LABELS[ticket.priority] },
              { label: "Raised", value: <DateText value={ticket.createdAt} mode="datetime" timeZone={timeZone} /> },
              ...(ticket.firstResponseDueAt && open ? [{ label: "First reply due", value: <DateText value={ticket.firstResponseDueAt} mode="datetime" timeZone={timeZone} /> }] : []),
              ...(ticket.resolutionDueAt && open ? [{ label: "Resolution due", value: <DateText value={ticket.resolutionDueAt} mode="datetime" timeZone={timeZone} /> }] : []),
              ...(ticket.resolvedAt ? [{ label: "Resolved", value: <DateText value={ticket.resolvedAt} mode="datetime" timeZone={timeZone} /> }] : []),
            ]}
          />
        </SectionCard>
      </div>
    </div>
  );
}
