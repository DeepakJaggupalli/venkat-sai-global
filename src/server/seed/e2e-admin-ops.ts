import "server-only";

import { and, desc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import { approvalRequests, organizationDocuments } from "@/db/schema";
import { addOrganizationDocument, submitVerification } from "@/modules/organizations/service";

import { e2eEmail, generatePassword, isoDay, orgContextFor, storeTestPdf, upsertPasswordUser, type SeedLog } from "./e2e-helpers";
import { ensureOrganization } from "./e2e-orgs";

/**
 * E2E seed block for the Command Centre operations spec (ui-admin-ops). Called from runE2eSeed(). Local
 * database only (see e2e-guard.ts).
 *
 *  - One employer per Playwright project ("chromium", "mobile") with a verification request waiting in the
 *    approval centre, so each project can decide one. Every run re-submits the verification (a renewal once
 *    it has been approved), so the request is open again after re-seeding.
 */

const PROJECTS = ["chromium", "mobile"] as const;
const DOCUMENT_TYPE = "registration_certificate";

async function hasOpenVerification(organizationId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: approvalRequests.id })
    .from(approvalRequests)
    .where(and(eq(approvalRequests.entityId, organizationId), eq(approvalRequests.type, "employer_verification"), inArray(approvalRequests.status, ["pending", "in_review", "escalated"])))
    .orderBy(desc(approvalRequests.createdAt))
    .limit(1);
  return Boolean(row);
}

export async function seedAdminOpsQa(opts: { log: SeedLog }): Promise<Record<string, string>> {
  const { log } = opts;
  const env: Record<string, string> = {};
  log("Command Centre operations QA:");
  for (const project of PROJECTS) {
    const local = `admin-ops-pending-${project}`;
    const email = e2eEmail(local);
    const name = `E2E Pending Employer (${project}, test)`;
    // Nobody signs in as this owner; the password is random and never written to the env file.
    const { id: ownerUserId } = await upsertPasswordUser({ email, displayName: `E2E Pending Employer Owner (${project})`, password: generatePassword({ email, name }) }, { passwordChanged: false });
    const org = await ensureOrganization("employer", ownerUserId, {
      name,
      legalName: `${name} (test organisation)`,
      description: "Test employer whose verification the Command Centre operations spec decides.",
      email: e2eEmail(`${local}-office`),
      countryCode: "IN",
      stateRegion: "Andhra Pradesh",
      city: "Visakhapatnam",
    });
    if (!(await hasOpenVerification(org.id))) {
      const ctx = await orgContextFor(ownerUserId, org.id);
      const [document] = await db
        .select({ id: organizationDocuments.id })
        .from(organizationDocuments)
        .where(and(eq(organizationDocuments.organizationId, org.id), eq(organizationDocuments.documentType, DOCUMENT_TYPE), sql`${organizationDocuments.reviewStatus} <> 'rejected'`))
        .limit(1);
      if (!document) {
        const fileId = await storeTestPdf({ purpose: "org_document", ownerUserId, organizationId: org.id, name: `e2e-${DOCUMENT_TYPE}.pdf` });
        await addOrganizationDocument(ctx, org.id, { documentType: DOCUMENT_TYPE, fileId, title: "E2E test registration certificate", documentNumber: "E2E-TEST-REG", expiresOn: isoDay(730) });
      }
      await submitVerification(ctx);
    }
    env[`E2E_ADMINOPS_PENDING_ORG_${project.toUpperCase()}_ID`] = org.id;
    log(`  ${name}: verification waiting (${org.id})`);
  }
  return env;
}
