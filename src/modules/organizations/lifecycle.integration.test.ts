/**
 * Expiry task, partner agreements, employer branches / contracts and public pages against PostgreSQL
 * (isolated test database only):
 *   node scripts/test-db.mjs vsg_test_orgs_training
 *   $env:DATABASE_URL='postgres://postgres:postgres@127.0.0.1:5433/vsg_test_orgs_training'; npx vitest run src/modules/organizations
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const enabled = /vsg_test_/.test(process.env.DATABASE_URL ?? "");
const DAY = 86_400_000;

describe.skipIf(!enabled)("organisation lifecycle", async () => {
  if (!enabled) return;
  const { eq } = await import("drizzle-orm");
  const { db, pool } = await import("@/db");
  const { employerContracts, organizations, partnerAgreements, partnerLicences } = await import("@/db/schema");
  const fx = await import("./testing");
  const service = await import("./service");
  const partner = await import("./partner");
  const employer = await import("./employer");
  const institution = await import("./institution");
  const { runVerificationExpiry } = await import("./tasks");

  let staff: ReturnType<typeof fx.staffContext>;

  beforeAll(async () => {
    await fx.seedReferenceData();
    staff = fx.staffContext(await fx.createUser({ isStaff: true }), ["orgs.view", "orgs.manage", "orgs.verify", "partners.view", "partners.manage", "commercial.view"]);
  });

  afterAll(async () => {
    await pool.end();
  });

  async function newOrg(type: "employer" | "recruitment_partner" | "institution") {
    const owner = await fx.createUser();
    const org = await service.createOrganization(type, { name: `Lifecycle ${type} ${Date.now()}`, countryCode: "IN", city: "Visakhapatnam" }, owner);
    return { owner, org, ctx: await fx.memberContext(owner, org.id) };
  }

  async function orgRow(id: string) {
    const [row] = await db.select().from(organizations).where(eq(organizations.id, id));
    return row!;
  }

  it("warns 30 and 7 days before a verification lapses, once each, then expires it", async () => {
    const { org } = await newOrg("employer");
    const start = new Date();
    const expiresAt = new Date(start.getTime() + 20 * DAY);
    await fx.markOrganizationVerified(org.id, expiresAt);
    const reminders = async (since: Date) =>
      (await fx.tasksSince(since, "notifications.dispatch_org")).filter((t) => t.payload.organizationId === org.id && t.payload.event === "org.verification_expiring");

    const t0 = new Date(Date.now() - 1000);
    await runVerificationExpiry(start);
    await runVerificationExpiry(new Date(start.getTime() + DAY));
    const first = await reminders(t0);
    expect(first).toHaveLength(1);
    expect(first[0]!.payload.data).toMatchObject({ state: "expiring", subject: "verification" });

    await runVerificationExpiry(new Date(start.getTime() + 14 * DAY)); // 6 days left
    await runVerificationExpiry(new Date(start.getTime() + 15 * DAY));
    expect(await reminders(t0)).toHaveLength(2);

    await runVerificationExpiry(new Date(start.getTime() + 21 * DAY));
    expect(await orgRow(org.id)).toMatchObject({ status: "expired" });
    const all = await reminders(t0);
    expect(all.at(-1)!.payload.data).toMatchObject({ state: "expired" });
  });

  it("expires lapsed licences, contracts and agreements", async () => {
    const p = await newOrg("recruitment_partner");
    const fileId = await fx.createFileRow({ purpose: "partner_licence", ownerUserId: p.owner.id, organizationId: p.org.id });
    const licence = await partner.addPartnerLicence(p.ctx, p.org.id, {
      licenceType: "foreign_recruitment_licence",
      licenceNumber: "AE-RA-0099",
      issuingCountryCode: "AE",
      validFrom: "2025-01-01",
      validUntil: "2027-01-31",
      fileId,
      authorisedActivities: [],
      branchOffices: [],
    });
    await partner.verifyPartnerLicence(staff, { licenceId: licence.id, method: "document_review" }, new Date("2026-11-07T00:00:00Z"));
    await runVerificationExpiry(new Date("2027-02-01T03:00:00Z"));
    const [expiredLicence] = await db.select().from(partnerLicences).where(eq(partnerLicences.id, licence.id));
    expect(expiredLicence!.verificationStatus).toBe("expired");

    const e = await newOrg("employer");
    const contract = await employer.createEmployerContract(staff, e.org.id, {
      contractType: "managed_recruitment",
      title: "Welders for refinery shutdown",
      startsOn: "2026-01-01",
      endsOn: "2026-06-30",
      autoRenew: false,
      terms: { currency: "AED", fees: [{ label: "Per hire", model: "per_hire", amount: 1500 }] },
    });
    expect(contract.terms).toMatchObject({ currency: "AED", fees: [{ amountMinor: 150_000 }] });
    await employer.activateEmployerContract(staff, contract.id);
    await runVerificationExpiry(new Date("2026-07-02T00:00:00Z"));
    const [expiredContract] = await db.select().from(employerContracts).where(eq(employerContracts.id, contract.id));
    expect(expiredContract!.status).toBe("expired");
  });

  it("keeps exactly one active partner agreement and records acceptance evidence", async () => {
    const p = await newOrg("recruitment_partner");
    const v1 = await partner.issuePartnerAgreement(staff, p.org.id, {
      version: "2026.1",
      title: "Recruitment partner agreement",
      termsHtml: "<p>Terms</p><script>alert(1)</script>",
      commercialTerms: { feeModel: "flat_per_placement", currency: "INR", amount: 5000 },
    });
    expect(v1.termsSnapshot).toBe("<p>Terms</p>");
    expect(v1.commercialTerms).toMatchObject({ amountMinor: 500_000, currency: "INR" });
    await partner.acceptPartnerAgreement(p.ctx, { agreementId: v1.id, acceptedByName: "Suresh Babu" }, { ipHash: "hashed-ip", userAgent: "test" });
    const v2 = await partner.issuePartnerAgreement(staff, p.org.id, { version: "2026.2", title: "Recruitment partner agreement", termsHtml: "<p>Updated terms</p>" });
    await expect(partner.issuePartnerAgreement(staff, p.org.id, { version: "2026.2", title: "Dup", termsHtml: "<p>x</p>" })).rejects.toMatchObject({ code: "conflict" });
    await partner.acceptPartnerAgreement(p.ctx, { agreementId: v2.id, acceptedByName: "Suresh Babu" }, { ipHash: "hashed-ip-2", userAgent: "test" });
    const rows = await db.select().from(partnerAgreements).where(eq(partnerAgreements.organizationId, p.org.id));
    expect(rows.find((r) => r.id === v1.id)).toMatchObject({ status: "superseded", supersededByAgreementId: v2.id });
    expect(rows.find((r) => r.id === v2.id)).toMatchObject({ status: "active", acceptedByName: "Suresh Babu", ipHash: "hashed-ip-2" });
    expect((await partner.getActivePartnerAgreement(p.org.id))?.id).toBe(v2.id);
    await expect(partner.acceptPartnerAgreement(p.ctx, { agreementId: v1.id, acceptedByName: "Suresh Babu" }, { ipHash: null, userAgent: null })).rejects.toMatchObject({
      code: "invalid_state",
    });
    // Partners never see staff notes or internal quality scores.
    const view = await partner.getPartnerProfile(p.ctx, p.org.id);
    expect(view).not.toHaveProperty("statusNotes");
    expect(view).not.toHaveProperty("qualityScore");
  });

  it("serves public employer and institution pages only for verified, public organisations", async () => {
    const e = await newOrg("employer");
    await employer.updateCompanyProfile(e.ctx, e.org.id, {
      companySize: "51_200",
      hiringRegions: ["AE", "SA"],
      typicalRoles: ["Pipe welder"],
      typicalJobCategoryIds: [],
      aboutHtml: '<p>About us</p><img src="x" onerror="alert(1)">',
      benefitsOffered: ["Accommodation"],
      cultureMediaFileIds: [],
      isHiringOverseas: true,
    });
    await employer.createBranch(e.ctx, e.org.id, { name: "Head office", countryCode: "IN", isHeadquarters: true });
    await employer.createBranch(e.ctx, e.org.id, { name: "Dubai site", countryCode: "AE", isHeadquarters: true });
    const branches = await employer.listBranches(e.ctx, e.org.id);
    expect(branches.filter((b) => b.isHeadquarters).map((b) => b.name)).toEqual(["Dubai site"]);

    expect(await employer.getPublicCompany(e.org.slug)).toBeNull();
    await service.setOrganizationPublic(e.ctx, e.org.id, true);
    expect(await employer.getPublicCompany(e.org.slug)).toBeNull(); // not verified yet
    await fx.markOrganizationVerified(e.org.id);
    const page = await employer.getPublicCompany(e.org.slug);
    expect(page).toMatchObject({ name: e.org.name, profile: { hiringRegions: ["AE", "SA"], isHiringOverseas: true } });
    expect(page!.profile.aboutHtml).not.toContain("onerror");
    expect(page).not.toHaveProperty("registrationNumber");
    expect((await employer.listPublicCompanies({ hiringRegion: "SA" }, { page: 1, pageSize: 50, offset: 0 })).items.map((c) => c.id)).toContain(e.org.id);

    const i = await newOrg("institution");
    await institution.updateInstitutionProfile(i.ctx, i.org.id, { institutionKind: "iti", accreditationBodies: ["NCVT"], aboutHtml: "<p>ITI</p>" });
    await service.setOrganizationPublic(i.ctx, i.org.id, true);
    await fx.markOrganizationVerified(i.org.id);
    expect(await institution.getPublicInstitution(i.org.slug)).toMatchObject({ declaredAccreditationBodies: ["NCVT"], authorisedCertificateIssuer: null, publishedCourseCount: 0 });

    // Suspension hides the page again.
    await service.suspendOrganization(staff, e.org.id, "Under review");
    expect(await employer.getPublicCompany(e.org.slug)).toBeNull();
  });
});
