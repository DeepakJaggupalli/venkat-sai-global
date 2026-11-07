import "server-only";

/**
 * Operations read API (barrel). Staff reads take a StaffContext and check the relevant permission;
 * employer / requester / participant reads are scoped to the caller. See README.md.
 */
export { getLead, leadPipelineCounts, listLeads, type LeadDetail, type LeadListFilters, type LeadListItem } from "./leads-queries";
export { enquiryCounts, getEnquiry, listEnquiries, type EnquiryDetail, type EnquiryListFilters, type EnquiryListItem } from "./enquiries-queries";
export {
  getOrgRequirement,
  getRequirement,
  listOrgRequirements,
  listRequirements,
  requirementStatusCounts,
  type EmployerRequirementListItem,
  type EmployerRequirementView,
  type RequirementLineView,
  type RequirementListFilters,
  type RequirementListItem,
  type StaffRequirementDetail,
} from "./requirements-queries";
export {
  getMyTicket,
  getTicket,
  listMyTickets,
  listTickets,
  ticketQueueCounts,
  type RequesterTicketListItem,
  type RequesterTicketView,
  type StaffTicketDetail,
  type StaffTicketListItem,
  type TicketListFilters,
  type TicketMessageView,
} from "./support-queries";
export { countOpenTicketsPastDue } from "./support";
export { getStaffTask, listStaffTasks, myTaskCounts, type StaffTaskListFilters, type StaffTaskListItem } from "./work-queries";
export { listInternalNotes, type InternalNoteView } from "./work";
export { getThread, listThreads, listThreadsForContext, unreadThreadCount, type ThreadDetail, type ThreadListFilters, type ThreadListItem, type ThreadMessageView } from "./threads-queries";
