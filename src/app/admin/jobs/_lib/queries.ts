import "server-only";

import { and, count, eq, isNull, sql } from "drizzle-orm";

import type { SelectOption } from "@/components/shared/types";
import { db } from "@/db";
import { applications, interviews, partnerLicences, organizations, tasks, users } from "@/db/schema";

/**
 * Read models for the Command Centre job detail (callers hold jobs.view). Aggregates only — no
 * candidate personal data. Reported as a cross-module need (recruitment could expose a job summary).
 */
export async function jobApplicationSummary(jobId: string) {
  const [statusRows, shortlisted, interviewRows] = await Promise.all([
    db.select({ status: applications.status, value: count() }).from(applications).where(eq(applications.jobId, jobId)).groupBy(applications.status),
    db.select({ value: count() }).from(applications).where(and(eq(applications.jobId, jobId), eq(applications.isShortlisted, true))),
    db
      .select({ value: count() })
      .from(interviews)
      .innerJoin(applications, eq(applications.id, interviews.applicationId))
      .where(eq(applications.jobId, jobId)),
  ]);
  const byStatus = Object.fromEntries(statusRows.map((r) => [r.status, Number(r.value)])) as Record<string, number>;
  const total = statusRows.reduce((a, r) => a + Number(r.value), 0);
  return { total, byStatus, shortlisted: Number(shortlisted[0]?.value ?? 0), interviews: Number(interviewRows[0]?.value ?? 0) };
}

/** Open recruiter assignments (internal tasks linked to the job). */
export async function jobRecruiterTasks(jobId: string) {
  return db
    .select({ id: tasks.id, title: tasks.title, status: tasks.status, dueAt: tasks.dueAt, assigneeName: users.displayName })
    .from(tasks)
    .leftJoin(users, eq(users.id, tasks.assignedToUserId))
    .where(and(eq(tasks.relatedType, "job"), eq(tasks.relatedId, jobId), sql`${tasks.status} in ('todo','in_progress')`))
    .limit(20);
}

/** Verified, unexpired India recruiting-agent licences, for the recruiting-agent badge. */
export async function verifiedAgentLicenceOptions(): Promise<SelectOption[]> {
  const rows = await db
    .select({ id: partnerLicences.id, number: partnerLicences.licenceNumber, validUntil: partnerLicences.validUntil, orgName: organizations.name })
    .from(partnerLicences)
    .innerJoin(organizations, eq(organizations.id, partnerLicences.organizationId))
    .where(
      and(
        eq(partnerLicences.licenceType, "india_recruiting_agent"),
        eq(partnerLicences.verificationStatus, "verified"),
        isNull(partnerLicences.deletedAt),
        sql`(${partnerLicences.validUntil} is null or ${partnerLicences.validUntil} >= current_date)`,
      ),
    )
    .limit(200);
  return rows.map((r) => ({ value: r.id, label: `${r.orgName} · ${r.number}`, description: r.validUntil ? `Valid until ${String(r.validUntil).slice(0, 10)}` : undefined }));
}
