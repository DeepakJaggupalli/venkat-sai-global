/**
 * Verification submission and approval-centre decisions against PostgreSQL (isolated test database only):
 *   node scripts/test-db.mjs vsg_test_orgs_training
 *   $env:DATABASE_URL='postgres://postgres:postgres@127.0.0.1:5433/vsg_test_orgs_training'; npx vitest run src/modules/organizations
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const enabled = /vsg_test_/.test(process.env.DATABASE_URL ?? "");

describe.skipIf(!enabled)("organisation verification", async () => {
  if (!enabled) return;
  const { and, eq } = await import("drizzle-orm");
  const { db, pool } = await import("@/db");
  const { approvalRequests, organizationDocuments, organizations, organizationVerifications, partnerLicences } = await import("@/db/schema");
  const fx = await import("./testing");
  const service = await import("./service");
  const partner = await import("./partner");
  const approvals = await import("@/modules/approvals/service");

  let reviewer: ReturnType<typeof fx.staffContext>;

  beforeAll(async () => {
    await fx.seedReferenceData();
    const staffUser = await fx.createUser({ isStaff: true, displayName: "Reviewer" });
    reviewer = fx.staffContext(staffUser, ["approvals.view", "approvals.decide", "orgs.view", "orgs.verify", "orgs.manage"]);
  });

  afterAll(async () => {
    await pool.end();
  });

  async function newOrg(type: "employer" | "recruitment_partner" | "institution", countryCode = "IN") {
    const owner = await fx.createUser({ displayName: "Owner" });
    const org = await service.createOrganization(type, { name: `Verify ${type} ${Date.now()}`, countryCode, city: "Visakhapatnam", email: "office@example.test" }, owner);
    return { owner, org, ctx: await fx.memberContext(owner, org.id) };
  }

  async function addDoc(ctx: Awaited<ReturnType<typeof fx.memberContext>>, documentType: "registration_certificate" | "affiliation", expiresOn?: string) {
    const fileId = await fx.createFileRow({ purpose: "org_document", ownerUserId: ctx.user.id, organizationId: ctx.organization.id });
    return service.addOrganizationDocument(ctx, ctx.organization.id, { documentType, fileId, expiresOn });
  }

  async function openRequest(orgId: string) {
    const [row] = await db.select().from(approvalRequests).where(and(eq(approvalRequests.entityId, orgId))).orderBy(approvalRequests.createdAt);
    return row!;
  }

  async function orgRow(id: string) {
    const [row] = await db.select().from(organizations).where(eq(organizations.id, id));
    return row!;
  }

  it("refuses an incomplete submission and lists what is missing", async () => {
    const { ctx } = await newOrg("employer");
    await expect(service.submitVerification(ctx)).rejects.toMatchObject({ code: "validation", fieldErrors: { _form: [expect.stringMatching(/registration certificate/i)] } });
  });

  it("goes draft → pending → changes requested (draft) → resubmitted → verified with the document expiry", async () => {
    const { ctx, org } = await newOrg("employer");
    await addDoc(ctx, "registration_certificate", "2027-03-31");
    const since = new Date(Date.now() - 1000);
    const submitted = await service.submitVerification(ctx);
    expect(submitted.renewal).toBe(false);
    expect((await orgRow(org.id)).status).toBe("pending");
    const request = await openRequest(org.id);
    expect(request).toMatchObject({ type: "employer_verification", status: "pending", entityType: "organization" });
    expect(request.payload).toMatchObject({ verificationId: submitted.verificationId, documents: [expect.objectContaining({ documentType: "registration_certificate" })] });
    const docs = await db.select().from(organizationDocuments).where(eq(organizationDocuments.organizationId, org.id));
    expect(docs.every((d) => d.verificationId === submitted.verificationId)).toBe(true);
    // A second submission while in review is refused.
    await expect(service.submitVerification(await fx.memberContext(ctx.user, org.id))).rejects.toMatchObject({ code: "invalid_state" });

    await approvals.decideApproval({ requestId: request.id, decision: "changes_requested", reason: "Upload the trade licence page with the expiry date.", ctx: reviewer });
    const afterChanges = await orgRow(org.id);
    expect(afterChanges).toMatchObject({ status: "draft", statusReason: "Upload the trade licence page with the expiry date." });
    const [v1] = await db.select().from(organizationVerifications).where(eq(organizationVerifications.id, submitted.verificationId));
    expect(v1).toMatchObject({ status: "changes_requested", reviewedByUserId: reviewer.user.id });
    const notifications = await fx.tasksSince(since, "notifications.dispatch_org");
    expect(notifications.map((t) => t.payload.event)).toEqual(expect.arrayContaining(["org.verification_submitted", "org.verification_changes_requested"]));

    const second = await service.submitVerification(await fx.memberContext(ctx.user, org.id));
    const reopened = await openRequest(org.id);
    expect(reopened.id).toBe(request.id);
    expect(reopened.status).toBe("pending");
    await approvals.decideApproval({ requestId: request.id, decision: "approved", ctx: reviewer });
    const verified = await orgRow(org.id);
    expect(verified.status).toBe("verified");
    expect(verified.verifiedAt).toBeInstanceOf(Date);
    expect(verified.verificationExpiresAt?.toISOString()).toBe("2027-04-01T00:00:00.000Z");
    const [v2] = await db.select().from(organizationVerifications).where(eq(organizationVerifications.id, second.verificationId));
    expect(v2!.status).toBe("approved");
    const acceptedDocs = await db.select().from(organizationDocuments).where(eq(organizationDocuments.organizationId, org.id));
    expect(acceptedDocs.every((d) => d.reviewStatus === "accepted")).toBe(true);
  });

  it("rejects with a reason, and keeps a verified organisation verified when only a renewal is rejected", async () => {
    const { ctx, org } = await newOrg("employer");
    await addDoc(ctx, "registration_certificate");
    await service.submitVerification(ctx);
    const request = await openRequest(org.id);
    await approvals.decideApproval({ requestId: request.id, decision: "rejected", reason: "The registration number does not match.", ctx: reviewer });
    expect(await orgRow(org.id)).toMatchObject({ status: "rejected", statusReason: "The registration number does not match." });

    const again = await fx.memberContext(ctx.user, org.id);
    await service.submitVerification(again);
    const [latest] = await db.select().from(approvalRequests).where(and(eq(approvalRequests.entityId, org.id), eq(approvalRequests.status, "pending")));
    await approvals.decideApproval({ requestId: latest!.id, decision: "approved", ctx: reviewer });
    expect((await orgRow(org.id)).status).toBe("verified");

    const renewal = await service.submitVerification(await fx.memberContext(ctx.user, org.id));
    expect(renewal.renewal).toBe(true);
    expect((await orgRow(org.id)).status).toBe("verified");
    const [renewalRequest] = await db.select().from(approvalRequests).where(and(eq(approvalRequests.entityId, org.id), eq(approvalRequests.status, "pending")));
    await approvals.decideApproval({ requestId: renewalRequest!.id, decision: "rejected", reason: "Old certificate.", ctx: reviewer });
    expect(await orgRow(org.id)).toMatchObject({ status: "verified", statusReason: "Old certificate." });
  });

  it("requires a verified recruitment licence before approving a partner that recruits for overseas jobs", async () => {
    const { ctx, org } = await newOrg("recruitment_partner", "IN");
    await addDoc(ctx, "registration_certificate", "2029-01-31");
    await partner.updatePartnerProfile(ctx, org.id, {
      businessType: "agency",
      servicesProvided: ["candidate_sourcing", "emigration_clearance"],
      specialisations: ["Welding"],
      industryIds: [],
    });
    // Without any licence the submission is refused.
    await expect(service.submitVerification(await fx.memberContext(ctx.user, org.id))).rejects.toMatchObject({ code: "validation" });

    const fileId = await fx.createFileRow({ purpose: "partner_licence", ownerUserId: ctx.user.id, organizationId: org.id });
    const licence = await partner.addPartnerLicence(ctx, org.id, {
      licenceType: "india_recruiting_agent",
      licenceNumber: " b-1234/ap/per/1000+/5/0001/2026 ",
      issuingCountryCode: "IN",
      validFrom: "2026-01-01",
      validUntil: "2028-06-30",
      fileId,
      authorisedActivities: [],
      branchOffices: [],
    });
    expect(licence.licenceNumber).toBe("B-1234/AP/PER/1000+/5/0001/2026");
    await service.submitVerification(await fx.memberContext(ctx.user, org.id));
    const request = await openRequest(org.id);

    // Pending licence: approval is refused and nothing changes.
    await expect(approvals.decideApproval({ requestId: request.id, decision: "approved", ctx: reviewer })).rejects.toThrow(/Recruiting Agent registration/);
    expect((await orgRow(org.id)).status).toBe("pending");
    expect((await openRequest(org.id)).status).toBe("pending");

    await partner.verifyPartnerLicence(reviewer, { licenceId: licence.id, method: "registry_lookup" });
    await approvals.decideApproval({ requestId: request.id, decision: "approved", ctx: reviewer });
    const verified = await orgRow(org.id);
    expect(verified.status).toBe("verified");
    // Earliest of the document (2029-01-31) and the licence (2028-06-30), valid through the day.
    expect(verified.verificationExpiresAt?.toISOString()).toBe("2028-07-01T00:00:00.000Z");
    const [storedLicence] = await db.select().from(partnerLicences).where(eq(partnerLicences.id, licence.id));
    expect(storedLicence).toMatchObject({ verificationStatus: "verified", verificationMethod: "registry_lookup" });

    // Duplicate licence numbers are reported clearly.
    await expect(
      partner.addPartnerLicence(ctx, org.id, {
        licenceType: "india_recruiting_agent",
        licenceNumber: "B-1234/AP/PER/1000+/5/0001/2026",
        issuingCountryCode: "IN",
        authorisedActivities: [],
        branchOffices: [],
      }),
    ).rejects.toMatchObject({ code: "conflict" });
  });

  it("suspension cancels the open review; reactivation restores the right status", async () => {
    const { ctx, org } = await newOrg("institution");
    await addDoc(ctx, "registration_certificate");
    await addDoc(ctx, "affiliation");
    const { institutionProfiles } = await import("@/db/schema");
    await db.update(institutionProfiles).set({ institutionKind: "iti" }).where(eq(institutionProfiles.organizationId, org.id));
    await service.submitVerification(await fx.memberContext(ctx.user, org.id));
    const request = await openRequest(org.id);

    await service.suspendOrganization(reviewer, org.id, "Complaint under investigation.");
    expect(await orgRow(org.id)).toMatchObject({ status: "suspended", statusReason: "Complaint under investigation." });
    expect((await openRequest(org.id)).status).toBe("cancelled");
    await expect(approvals.decideApproval({ requestId: request.id, decision: "approved", ctx: reviewer })).rejects.toThrow(/already been decided/);

    const restored = await service.reactivateOrganization(reviewer, org.id);
    expect(restored.status).toBe("draft");
    await expect(service.reactivateOrganization(reviewer, org.id)).rejects.toMatchObject({ code: "invalid_state" });
  });

  it("locks verified identity details for members but not for staff", async () => {
    const { ctx, org } = await newOrg("employer");
    await addDoc(ctx, "registration_certificate");
    await service.submitVerification(ctx);
    const pendingCtx = await fx.memberContext(ctx.user, org.id);
    await expect(service.updateOrganization(pendingCtx, org.id, { name: "Renamed Co", countryCode: "IN", city: "Visakhapatnam", email: "office@example.test" })).rejects.toMatchObject({
      code: "validation",
    });
    // Non-identity fields can still change.
    await service.updateOrganization(pendingCtx, org.id, { name: org.name, countryCode: "IN", city: "Vizag", email: "office@example.test" });
    const updated = await service.updateOrganization(reviewer, org.id, { name: "Renamed Co", countryCode: "IN", city: "Vizag", email: "office@example.test" });
    expect(updated.name).toBe("Renamed Co");
  });
});
