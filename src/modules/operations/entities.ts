import "server-only";

import { sql, type SQL } from "drizzle-orm";

import type { DbOrTx } from "@/db";
import type { PlatformPermission } from "@/config/permissions";

import type { NoteEntityType } from "./constants";

/**
 * Read-only lookups for polymorphic references (internal notes, task / ticket "related" links, thread
 * contexts): does the entity exist, and does it belong to an organisation? Raw parameterised SQL keeps
 * this module independent of later-layer services.
 */

const TABLE: Record<NoteEntityType, string> = {
  lead: "leads",
  enquiry: "enquiries",
  requirement: "requirement_requests",
  ticket: "support_tickets",
  task: "tasks",
  organization: "organizations",
  candidate: "candidate_profiles",
  application: "applications",
  job: "jobs",
  placement: "placements",
  partner_assignment: "partner_assignments",
  partner_submission: "partner_submissions",
  interview: "interviews",
  offer: "offers",
};

/** Staff permission needed to read (and annotate) each kind of entity. Tasks are open to every staff member. */
export const ENTITY_STAFF_PERMISSION: Record<NoteEntityType, PlatformPermission | null> = {
  lead: "leads.view",
  enquiry: "leads.view",
  requirement: "requirements.view",
  ticket: "support.view",
  task: null,
  organization: "orgs.view",
  candidate: "candidates.view",
  application: "recruitment.view",
  job: "jobs.view",
  placement: "recruitment.view",
  partner_assignment: "partners.view",
  partner_submission: "partners.view",
  interview: "recruitment.view",
  offer: "recruitment.view",
};

export async function entityExists(tx: DbOrTx, type: NoteEntityType, id: string): Promise<boolean> {
  const result = await tx.execute<{ ok: number }>(sql`select 1 as ok from ${sql.identifier(TABLE[type])} where id = ${id} limit 1`);
  return result.rows.length > 0;
}

/**
 * Whether an organisation is a party to the entity (employer of the job / requirement / placement, partner
 * that owns the assignment / submission / application, unlocked or applying candidate).
 */
export async function organizationOwnsEntity(tx: DbOrTx, type: NoteEntityType, id: string, organizationId: string): Promise<boolean> {
  let query: SQL | null = null;
  switch (type) {
    case "organization":
      return id === organizationId;
    case "requirement":
      query = sql`select 1 from requirement_requests where id = ${id} and organization_id = ${organizationId}`;
      break;
    case "job":
      query = sql`select 1 from jobs where id = ${id} and organization_id = ${organizationId} and deleted_at is null`;
      break;
    case "application":
      query = sql`select 1 from applications a join jobs j on j.id = a.job_id where a.id = ${id} and (j.organization_id = ${organizationId} or a.partner_organization_id = ${organizationId})`;
      break;
    case "placement":
      query = sql`select 1 from placements where id = ${id} and (organization_id = ${organizationId} or partner_organization_id = ${organizationId})`;
      break;
    case "partner_assignment":
      query = sql`select 1 from partner_assignments where id = ${id} and partner_organization_id = ${organizationId}`;
      break;
    case "partner_submission":
      query = sql`select 1 from partner_submissions where id = ${id} and partner_organization_id = ${organizationId}`;
      break;
    case "candidate":
      query = sql`select 1 where exists (
          select 1 from applications a join jobs j on j.id = a.job_id where a.candidate_id = ${id} and (j.organization_id = ${organizationId} or a.partner_organization_id = ${organizationId})
        ) or exists (
          select 1 from profile_unlocks u where u.candidate_id = ${id} and u.organization_id = ${organizationId} and u.revoked_at is null and (u.expires_at is null or u.expires_at > now())
        ) or exists (
          select 1 from partner_submissions s where s.candidate_id = ${id} and s.partner_organization_id = ${organizationId}
        )`;
      break;
    default:
      return false;
  }
  const result = await tx.execute<{ "?column?": number }>(sql`${query} limit 1`);
  return result.rows.length > 0;
}
