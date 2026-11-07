import { and, eq, gt, isNotNull, isNull, lt, lte, sql } from "drizzle-orm";

import type { TaskHandlers } from "@/server/tasks/types";

/**
 * Background task handlers owned by the organizations module.
 * Task type names must be prefixed with "organizations." (see src/server/tasks/schedule.ts for recurring ones).
 *
 * organizations.verification_expiry (daily):
 *  - verified organisations whose verificationExpiresAt passed → expired (+ notification)
 *  - reminders 30 and 7 days before an organisation verification or a verified partner licence expires
 *    (org.verification_expiring; idempotent through a "last reminder sent" timestamp)
 *  - verified partner licences past validUntil → expired
 *  - active employer contracts past endsOn (without auto-renewal) → expired
 *  - active partner agreements past effectiveUntil → expired
 *  - institution certificate-issuer authorisations past authorisedUntil → withdrawn
 */
export type VerificationExpirySummary = {
  organizationsExpired: number;
  organizationReminders: number;
  licencesExpired: number;
  licenceReminders: number;
  contractsExpired: number;
  agreementsExpired: number;
  issuerAuthorisationsLapsed: number;
  failures: number;
};

const BATCH = 500;

export async function runVerificationExpiry(now: Date = new Date(), log: (message: string, data?: Record<string, unknown>) => void = () => undefined): Promise<VerificationExpirySummary> {
  const { db } = await import("@/db");
  const schema = await import("@/db/schema");
  const { audit } = await import("@/modules/audit");
  const { notifyOrganization } = await import("@/modules/notifications");
  const { ORG_PERMISSION } = await import("./access");
  const { ORG_PROFILE_PATH } = await import("./paths");
  const { PARTNER_LICENCE_TYPE_LABELS } = await import("./constants");
  const { dueReminderThreshold, daysUntil, endOfValidityDay, toIsoDate, EXPIRY_REMINDER_DAYS } = await import("./rules");
  const { organizations, partnerLicences, employerContracts, partnerAgreements, institutionProfiles } = schema;

  const summary: VerificationExpirySummary = {
    organizationsExpired: 0,
    organizationReminders: 0,
    licencesExpired: 0,
    licenceReminders: 0,
    contractsExpired: 0,
    agreementsExpired: 0,
    issuerAuthorisationsLapsed: 0,
    failures: 0,
  };
  const today = toIsoDate(now);
  const horizon = new Date(now.getTime() + Math.max(...EXPIRY_REMINDER_DAYS) * 86_400_000);
  const guard = async (label: string, id: string, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (error) {
      summary.failures += 1;
      log(`organizations.verification_expiry: ${label} failed`, { id, error: error instanceof Error ? error.message : String(error) });
    }
  };

  // 1. Lapsed organisation verifications.
  const lapsed = await db
    .select()
    .from(organizations)
    .where(and(eq(organizations.status, "verified"), isNull(organizations.deletedAt), isNotNull(organizations.verificationExpiresAt), lte(organizations.verificationExpiresAt, now)))
    .limit(BATCH);
  for (const org of lapsed) {
    await guard("expire organisation", org.id, () =>
      db.transaction(async (tx) => {
        const updated = await tx
          .update(organizations)
          .set({ status: "expired", statusReason: "The verification period ended. Upload current documents and submit again to renew." })
          .where(and(eq(organizations.id, org.id), eq(organizations.status, "verified")))
          .returning({ id: organizations.id });
        if (!updated.length) return;
        await notifyOrganization(
          {
            event: "org.verification_expiring",
            organizationId: org.id,
            permission: ORG_PERMISSION.profile[org.type],
            data: { organizationName: org.name, subject: "verification", state: "expired", expiresAt: org.verificationExpiresAt?.toISOString() ?? null },
            link: ORG_PROFILE_PATH[org.type],
            dedupeKey: `org-verification-expired:${org.id}:${org.verificationExpiresAt?.toISOString()}`,
          },
          { tx },
        );
        await audit({ action: "organization.verification_expired", entityType: "organization", entityId: org.id, organizationId: org.id, actorType: "system", metadata: { automatic: true }, tx });
        summary.organizationsExpired += 1;
      }),
    );
  }

  // 2. Organisation verification reminders (30 / 7 days).
  const expiring = await db
    .select()
    .from(organizations)
    .where(and(eq(organizations.status, "verified"), isNull(organizations.deletedAt), gt(organizations.verificationExpiresAt, now), lte(organizations.verificationExpiresAt, horizon)))
    .limit(BATCH);
  for (const org of expiring) {
    const expiresAt = org.verificationExpiresAt!;
    const lastSentRaw = (org.metadata ?? {}).verificationExpiryReminderSentAt;
    const lastSent = typeof lastSentRaw === "string" && !Number.isNaN(Date.parse(lastSentRaw)) ? new Date(lastSentRaw) : null;
    const threshold = dueReminderThreshold(expiresAt, lastSent, now);
    if (threshold === null) continue;
    await guard("organisation reminder", org.id, () =>
      db.transaction(async (tx) => {
        await notifyOrganization(
          {
            event: "org.verification_expiring",
            organizationId: org.id,
            permission: ORG_PERMISSION.profile[org.type],
            data: { organizationName: org.name, subject: "verification", state: "expiring", daysLeft: daysUntil(expiresAt, now), expiresAt: expiresAt.toISOString() },
            link: ORG_PROFILE_PATH[org.type],
            dedupeKey: `org-verification-expiring:${org.id}:${expiresAt.toISOString()}:${threshold}`,
          },
          { tx },
        );
        await tx
          .update(organizations)
          .set({ metadata: sql`coalesce(${organizations.metadata}, '{}'::jsonb) || ${JSON.stringify({ verificationExpiryReminderSentAt: now.toISOString() })}::jsonb` })
          .where(eq(organizations.id, org.id));
        summary.organizationReminders += 1;
      }),
    );
  }

  // 3. Lapsed partner licences.
  const lapsedLicences = await db
    .select({ licence: partnerLicences, orgName: organizations.name })
    .from(partnerLicences)
    .innerJoin(organizations, eq(organizations.id, partnerLicences.organizationId))
    .where(and(eq(partnerLicences.verificationStatus, "verified"), isNull(partnerLicences.deletedAt), isNotNull(partnerLicences.validUntil), lt(partnerLicences.validUntil, today)))
    .limit(BATCH);
  for (const { licence, orgName } of lapsedLicences) {
    await guard("expire licence", licence.id, () =>
      db.transaction(async (tx) => {
        const updated = await tx
          .update(partnerLicences)
          .set({ verificationStatus: "expired" })
          .where(and(eq(partnerLicences.id, licence.id), eq(partnerLicences.verificationStatus, "verified")))
          .returning({ id: partnerLicences.id });
        if (!updated.length) return;
        await notifyOrganization(
          {
            event: "org.verification_expiring",
            organizationId: licence.organizationId,
            permission: ORG_PERMISSION.profile.recruitment_partner,
            data: {
              organizationName: orgName,
              subject: "licence",
              state: "expired",
              licenceType: PARTNER_LICENCE_TYPE_LABELS[licence.licenceType],
              licenceNumber: licence.licenceNumber,
              expiresAt: licence.validUntil,
            },
            link: ORG_PROFILE_PATH.recruitment_partner,
            dedupeKey: `partner-licence-expired:${licence.id}:${licence.validUntil}`,
          },
          { tx },
        );
        await audit({ action: "partner.licence_expired", entityType: "partner_licence", entityId: licence.id, organizationId: licence.organizationId, actorType: "system", metadata: { automatic: true }, tx });
        summary.licencesExpired += 1;
      }),
    );
  }

  // 4. Licence reminders (30 / 7 days).
  const expiringLicences = await db
    .select({ licence: partnerLicences, orgName: organizations.name })
    .from(partnerLicences)
    .innerJoin(organizations, eq(organizations.id, partnerLicences.organizationId))
    .where(
      and(
        eq(partnerLicences.verificationStatus, "verified"),
        isNull(partnerLicences.deletedAt),
        isNull(organizations.deletedAt),
        isNotNull(partnerLicences.validUntil),
        sql`${partnerLicences.validUntil} >= ${today}`,
        sql`${partnerLicences.validUntil} <= ${toIsoDate(horizon)}`,
      ),
    )
    .limit(BATCH);
  for (const { licence, orgName } of expiringLicences) {
    const expiresAt = endOfValidityDay(licence.validUntil!);
    const threshold = dueReminderThreshold(expiresAt, licence.expiryReminderSentAt, now);
    if (threshold === null) continue;
    await guard("licence reminder", licence.id, () =>
      db.transaction(async (tx) => {
        await notifyOrganization(
          {
            event: "org.verification_expiring",
            organizationId: licence.organizationId,
            permission: ORG_PERMISSION.profile.recruitment_partner,
            data: {
              organizationName: orgName,
              subject: "licence",
              state: "expiring",
              daysLeft: daysUntil(expiresAt, now),
              licenceType: PARTNER_LICENCE_TYPE_LABELS[licence.licenceType],
              licenceNumber: licence.licenceNumber,
              expiresAt: licence.validUntil,
            },
            link: ORG_PROFILE_PATH.recruitment_partner,
            dedupeKey: `partner-licence-expiring:${licence.id}:${licence.validUntil}:${threshold}`,
          },
          { tx },
        );
        await tx.update(partnerLicences).set({ expiryReminderSentAt: now }).where(eq(partnerLicences.id, licence.id));
        summary.licenceReminders += 1;
      }),
    );
  }

  // 5. Employer contracts past their end date (auto-renewing contracts are renewed by staff).
  const contracts = await db
    .update(employerContracts)
    .set({ status: "expired" })
    .where(and(eq(employerContracts.status, "active"), eq(employerContracts.autoRenew, false), isNotNull(employerContracts.endsOn), lt(employerContracts.endsOn, today)))
    .returning({ id: employerContracts.id, organizationId: employerContracts.organizationId });
  for (const c of contracts) {
    await audit({ action: "employer.contract_expired", entityType: "employer_contract", entityId: c.id, organizationId: c.organizationId, actorType: "system", metadata: { automatic: true } });
  }
  summary.contractsExpired = contracts.length;

  // 6. Partner agreements past their end date.
  const agreements = await db
    .update(partnerAgreements)
    .set({ status: "expired" })
    .where(and(eq(partnerAgreements.status, "active"), isNotNull(partnerAgreements.effectiveUntil), lt(partnerAgreements.effectiveUntil, today)))
    .returning({ id: partnerAgreements.id, organizationId: partnerAgreements.organizationId });
  for (const a of agreements) {
    await audit({ action: "partner.agreement_expired", entityType: "partner_agreement", entityId: a.id, organizationId: a.organizationId, actorType: "system", metadata: { automatic: true } });
  }
  summary.agreementsExpired = agreements.length;

  // 7. Lapsed certificate-issuer authorisations.
  const lapsedIssuers = await db
    .update(institutionProfiles)
    .set({ isAuthorisedCertificateIssuer: false })
    .where(and(eq(institutionProfiles.isAuthorisedCertificateIssuer, true), isNotNull(institutionProfiles.authorisedUntil), lt(institutionProfiles.authorisedUntil, today)))
    .returning({ organizationId: institutionProfiles.organizationId });
  for (const i of lapsedIssuers) {
    await audit({ action: "institution.issuer_authorisation_lapsed", entityType: "organization", entityId: i.organizationId, organizationId: i.organizationId, actorType: "system" });
  }
  summary.issuerAuthorisationsLapsed = lapsedIssuers.length;

  return summary;
}

export const tasks: TaskHandlers = {
  "organizations.verification_expiry": async (_payload, ctx) => {
    const summary = await runVerificationExpiry(new Date(), ctx.log);
    ctx.log("organizations.verification_expiry finished", summary);
    if (summary.failures > 0) throw new Error(`${summary.failures} item(s) failed; the task will retry (completed items are idempotent).`);
  },
};
