/**
 * Broad smoke test of organisation administration paths against PostgreSQL (isolated test database only):
 *   $env:DATABASE_URL='postgres://postgres:postgres@127.0.0.1:5433/vsg_test_orgs_training'; npx vitest run src/modules/organizations
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const enabled = /vsg_test_/.test(process.env.DATABASE_URL ?? "");

describe.skipIf(!enabled)("organisation administration", async () => {
  if (!enabled) return;
  const { eq } = await import("drizzle-orm");
  const { db, pool } = await import("@/db");
  const { files, organizationDocuments, organizationMembers, organizations, partnerAgreements, partnerLicences } = await import("@/db/schema");
  const fx = await import("./testing");
  const service = await import("./service");
  const queries = await import("./queries");
  const members = await import("./members");
  const partner = await import("./partner");
  const employer = await import("./employer");

  const page = { page: 1, pageSize: 50, offset: 0 };
  let staff: ReturnType<typeof fx.staffContext>;

  beforeAll(async () => {
    await fx.seedReferenceData();
    staff = fx.staffContext(await fx.createUser({ isStaff: true, displayName: "Ops" }), [
      "orgs.view",
      "orgs.manage",
      "orgs.verify",
      "partners.view",
      "partners.manage",
      "commercial.view",
    ]);
  });

  afterAll(async () => {
    await pool.end();
  });

  async function newOrg(type: "employer" | "recruitment_partner" | "institution", countryCode = "IN") {
    const owner = await fx.createUser({ displayName: "Owner" });
    const org = await service.createOrganization(type, { name: `Admin ${type} ${Date.now()}`, countryCode, city: "Visakhapatnam", email: "office@example.test" }, owner);
    return { owner, org, ctx: await fx.memberContext(owner, org.id) };
  }

  it("overview, documents, logo, account manager and Command Centre lists", async () => {
    const { org, ctx, owner } = await newOrg("employer");
    const logoId = await fx.createFileRow({ purpose: "org_logo", ownerUserId: owner.id, organizationId: org.id, mimeType: "image/png" });
    await service.setOrganizationLogo(ctx, org.id, logoId);
    const [logo] = await db.select().from(files).where(eq(files.id, logoId));
    expect(logo!.visibility).toBe("public");

    const docFile = await fx.createFileRow({ purpose: "org_document", ownerUserId: owner.id, organizationId: org.id });
    const doc = await service.addOrganizationDocument(ctx, org.id, { documentType: "registration_certificate", fileId: docFile, issuedOn: "2020-01-01", expiresOn: "2030-01-01" });
    const extraFile = await fx.createFileRow({ purpose: "org_document", ownerUserId: owner.id, organizationId: org.id });
    const extra = await service.addOrganizationDocument(ctx, org.id, { documentType: "address_proof", fileId: extraFile });
    // Another organisation's file cannot be attached.
    const foreign = await newOrg("employer");
    const foreignFile = await fx.createFileRow({ purpose: "org_document", ownerUserId: foreign.owner.id, organizationId: foreign.org.id });
    await expect(service.addOrganizationDocument(ctx, org.id, { documentType: "other", fileId: foreignFile })).rejects.toThrow(/cannot be used here/);

    await service.reviewOrganizationDocument(staff, { documentId: extra.id, reviewStatus: "rejected", reviewNotes: "Blurred scan." });
    await service.removeOrganizationDocument(ctx, extra.id);
    const [removedFile] = await db.select().from(files).where(eq(files.id, extraFile));
    expect(removedFile!.deletedAt).toBeInstanceOf(Date);
    const docs = await queries.listOrganizationDocuments(ctx, org.id);
    expect(docs.map((d) => d.id)).toEqual([doc.id]);
    expect(docs[0]!.file).toMatchObject({ id: docFile, url: `/api/v1/files/${docFile}` });

    const overview = await queries.getOrganizationOverview(ctx, org.id);
    expect(overview).toMatchObject({ readiness: { ready: true }, memberCount: 1, logo: { url: expect.stringContaining(logoId) } });
    await service.submitVerification(ctx);
    // Submitted documents are evidence and cannot be removed.
    await expect(service.removeOrganizationDocument(ctx, doc.id)).rejects.toMatchObject({ code: "invalid_state" });
    expect((await queries.listVerificationHistory(ctx, org.id))[0]).toMatchObject({ status: "submitted" });
    expect((await queries.listVerificationHistory(staff, org.id))[0]).toHaveProperty("reviewedByName");

    await service.setAccountManager(staff, org.id, staff.user.id);
    await expect(service.setAccountManager(staff, org.id, owner.id)).rejects.toMatchObject({ code: "validation" });
    const list = await queries.listOrganizations(staff, { type: "employer", status: "pending", q: "Admin employer" }, page);
    expect(list.items.find((o) => o.id === org.id)).toMatchObject({ accountManagerName: "Ops", memberCount: 1 });
    expect((await queries.countOrganizationsByStatus(staff)).some((r) => r.type === "employer" && r.status === "pending")).toBe(true);
    // Members of other organisations and staff without permission are refused.
    await expect(queries.getOrganizationOverview(foreign.ctx, org.id)).rejects.toMatchObject({ code: "forbidden" });
    await expect(queries.listOrganizations(fx.staffContext(staff.user, ["users.view"]), {}, page)).rejects.toMatchObject({ code: "forbidden" });

    // Staff can end a verification by hand.
    await fx.markOrganizationVerified(org.id);
    await service.expireOrganizationVerification(staff, org.id, "Licence withdrawn by the issuer.");
    const [expired] = await db.select().from(organizations).where(eq(organizations.id, org.id));
    expect(expired).toMatchObject({ status: "expired", statusReason: "Licence withdrawn by the issuer." });
  });

  it("team management: details, options, roles, removal and leaving", async () => {
    const { org, ctx, owner } = await newOrg("employer");
    const branch = await employer.createBranch(ctx, org.id, { name: "Plant 2", countryCode: "IN", isHeadquarters: false });
    const colleague = await fx.createUser({ displayName: "Asha" });
    await db.insert(organizationMembers).values({ organizationId: org.id, userId: colleague.id, roleId: await fx.templateRoleId("employer", "recruiter"), status: "active" });
    const roster = await members.listMembers(ctx, org.id);
    const colleagueRow = roster.find((m) => m.userId === colleague.id)!;
    await members.updateMemberDetails(ctx, { memberId: colleagueRow.id, jobTitle: "Recruiter", department: "HR", branchId: branch.id });
    await expect(members.updateMemberDetails(ctx, { memberId: colleagueRow.id, branchId: "00000000-0000-4000-8000-000000000000" })).rejects.toMatchObject({ code: "validation" });

    const colleagueCtx = await fx.memberContext(colleague, org.id);
    expect((await members.listMemberOptions(colleagueCtx, org.id)).map((o) => o.displayName).sort()).toEqual(["Asha", "Owner"]);
    await expect(members.listMembers(colleagueCtx, org.id)).rejects.toMatchObject({ code: "forbidden" });

    const role = await members.createOrgRole(ctx, org.id, { name: "Shortlister", permissions: ["employer.dashboard", "employer.candidates.lists"] });
    await members.updateOrgRole(ctx, role.id, { name: "Shortlister", description: "Shortlists only", permissions: ["employer.dashboard"] });
    await members.changeMemberRole(ctx, colleagueRow.id, role.id);
    await expect(members.deleteOrgRole(ctx, role.id)).rejects.toMatchObject({ code: "conflict" });
    expect((await members.listOrgRoles(ctx, org.id)).find((r) => r.id === role.id)).toMatchObject({ isTemplate: false, memberCount: 1 });
    await members.disableMember(ctx, colleagueRow.id);
    await members.enableMember(ctx, colleagueRow.id);
    await members.removeMember(ctx, colleagueRow.id);
    await members.deleteOrgRole(ctx, role.id);
    await expect(members.removeMember(ctx, ctx.membership.id)).rejects.toMatchObject({ code: "invalid_state" });

    // A second owner can leave; the last one cannot.
    const coOwner = await fx.createUser({ displayName: "Co-owner" });
    await db.insert(organizationMembers).values({ organizationId: org.id, userId: coOwner.id, roleId: await fx.templateRoleId("employer", "owner"), status: "active" });
    await members.leaveOrganization(await fx.memberContext(coOwner, org.id));
    await expect(members.leaveOrganization(await fx.memberContext(owner, org.id))).rejects.toMatchObject({ code: "invalid_state" });
  });

  it("partner licences, territories and agreements administration", async () => {
    const { org, ctx, owner } = await newOrg("recruitment_partner", "NP");
    const fileId = await fx.createFileRow({ purpose: "partner_licence", ownerUserId: owner.id, organizationId: org.id });
    const licence = await partner.addPartnerLicence(ctx, org.id, {
      licenceType: "foreign_recruitment_licence",
      licenceNumber: "np-123",
      issuingCountryCode: "NP",
      fileId,
      authorisedActivities: ["Recruitment for overseas employment"],
      branchOffices: [],
      holderName: "Himalaya Manpower Pvt Ltd",
    });
    expect(licence.details).toMatchObject({ holderName: "Himalaya Manpower Pvt Ltd" });
    expect((await partner.listLicencesForReview(staff, { status: "pending" }, page)).items.map((l) => l.id)).toContain(licence.id);
    await partner.rejectPartnerLicence(staff, { licenceId: licence.id, reason: "Expired scan", notes: "Checked registry" });
    expect((await partner.listPartnerLicences(ctx, org.id))[0]).not.toHaveProperty("notes");
    expect((await partner.listPartnerLicences(staff, org.id))[0]).toMatchObject({ notes: "Checked registry", verificationStatus: "rejected" });
    await partner.updatePartnerLicence(ctx, licence.id, {
      licenceType: "foreign_recruitment_licence",
      licenceNumber: "NP-123",
      issuingCountryCode: "NP",
      validUntil: "2028-12-31",
      authorisedActivities: [],
      branchOffices: [],
    });
    const [renewed] = await db.select().from(partnerLicences).where(eq(partnerLicences.id, licence.id));
    expect(renewed).toMatchObject({ verificationStatus: "pending", rejectionReason: null, validUntil: "2028-12-31" });
    await partner.verifyPartnerLicence(staff, { licenceId: licence.id, method: "issuer_confirmation" });
    await expect(partner.deletePartnerLicence(ctx, licence.id)).rejects.toMatchObject({ code: "forbidden" });
    await partner.expirePartnerLicence(staff, { licenceId: licence.id });
    await partner.deletePartnerLicence(ctx, licence.id);

    const territory = await partner.addPartnerTerritory(ctx, org.id, { countryCode: "NP", scope: "sourcing" });
    await expect(partner.addPartnerTerritory(ctx, org.id, { countryCode: "NP", scope: "both" })).rejects.toMatchObject({ code: "conflict" });
    await partner.setTerritoryAuthorisation(staff, { territoryId: territory.id, isAuthorised: true, notes: "Covered by licence" });
    await partner.updatePartnerTerritory(ctx, territory.id, { countryCode: "NP", scope: "both" });
    const [afterChange] = await partner.listPartnerTerritories(staff, org.id);
    expect(afterChange).toMatchObject({ scope: "both", isAuthorised: false });
    await partner.removePartnerTerritory(ctx, territory.id);

    await fx.markOrganizationVerified(org.id);
    const issued = await partner.issuePartnerAgreementToPartners(staff, { version: `bulk-${Date.now()}`, title: "Standard terms", termsHtml: "<p>Standard</p>" }, { organizationIds: [org.id] });
    expect(issued).toEqual({ issued: 1, skipped: 0 });
    const [offer] = await partner.listPartnerAgreements(ctx, org.id);
    await partner.terminatePartnerAgreement(staff, { agreementId: offer!.id, reason: "Superseded by a negotiated contract" });
    const [terminated] = await db.select().from(partnerAgreements).where(eq(partnerAgreements.id, offer!.id));
    expect(terminated).toMatchObject({ status: "terminated" });
    await partner.setPartnerStatusNotes(staff, org.id, "Good responsiveness.");
    expect(await partner.getPartnerProfile(staff, org.id)).toMatchObject({ statusNotes: "Good responsiveness." });
  });

  it("employer contracts: billing members read, staff edit and terminate", async () => {
    const { org, ctx } = await newOrg("employer");
    const contract = await employer.createEmployerContract(staff, org.id, { contractType: "bulk_supply", title: "Shutdown manpower", autoRenew: false });
    await expect(employer.activateEmployerContract(staff, contract.id)).rejects.toMatchObject({ code: "invalid_state" });
    await employer.updateEmployerContract(staff, contract.id, {
      contractType: "bulk_supply",
      title: "Shutdown manpower 2027",
      startsOn: "2027-01-01",
      endsOn: "2027-03-31",
      autoRenew: false,
      terms: { currency: "SAR", fees: [{ label: "Per worker month", model: "per_worker_month", amount: 350 }], paymentTermsDays: 30 },
    });
    await employer.activateEmployerContract(staff, contract.id);
    expect((await employer.listEmployerContracts(ctx, org.id))[0]).toMatchObject({ status: "active", terms: { currency: "SAR", fees: [{ amountMinor: 35_000 }] } });
    await employer.terminateEmployerContract(staff, { contractId: contract.id, reason: "Project cancelled" });
    await expect(employer.updateEmployerContract(staff, contract.id, { contractType: "bulk_supply", title: "x", autoRenew: false })).rejects.toMatchObject({ code: "invalid_state" });
    const [doc] = await db.select({ id: organizationDocuments.id }).from(organizationDocuments).where(eq(organizationDocuments.organizationId, org.id));
    expect(doc).toBeUndefined();
  });
});
