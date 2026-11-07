import "server-only";

import { and, asc, count, desc, eq, gt, ilike, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { db, type DbOrTx } from "@/db";
import { companyBranches, companyProfiles, countries, currencies, employerContracts, files, industries, jobCategories, organizations, users } from "@/db/schema";
import { toMinorUnits } from "@/lib/format";
import { paginated, type PageQuery, type Paginated } from "@/lib/http";
import { sanitizeRichText } from "@/lib/sanitize";
import { audit } from "@/modules/audit";
import { fileUrl, requireUploadedFile, setFileVisibility, thumbnailUrl } from "@/modules/files";
import type { StaffContext } from "@/modules/identity/authz";

import { assertStaff, authorizeOrg, ORG_PERMISSION, type OrgActor } from "./access";
import { invalidStateError, notFoundError, validationError, withConstraintMessages } from "./errors";
import type { CompanyProfileRow } from "./readiness";
import type { CompanyBranchInput, CompanyProfileInput, EmployerContractInput } from "./schemas";
import { assertCountryExists } from "./service";

export type CompanyBranchRow = typeof companyBranches.$inferSelect;
export type EmployerContractRow = typeof employerContracts.$inferSelect;

const EMPLOYER_ONLY = ["employer"] as const;
const PROFILE_RULE = { member: ORG_PERMISSION.profile, staff: "orgs.manage" as const, types: EMPLOYER_ONLY };

export type PublicImage = { id: string; url: string; thumbnailUrl: string | null; width: number | null; height: number | null };

export type PublicCompany = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  websiteUrl: string | null;
  industryName: string | null;
  countryCode: string | null;
  countryName: string | null;
  city: string | null;
  logo: PublicImage | null;
  /** Organisation verified by Venkat Sai (only verified organisations have a public page). */
  verifiedAt: Date | null;
  profile: {
    companySize: CompanyProfileRow["companySize"];
    foundedYear: number | null;
    headquartersCountryCode: string | null;
    headquartersCountryName: string | null;
    hiringRegions: string[];
    typicalRoles: string[];
    employerBrandingTagline: string | null;
    /** Sanitised on write; render with <SafeHtml>. Self-declared by the employer. */
    aboutHtml: string | null;
    cover: PublicImage | null;
    socialLinks: CompanyProfileRow["socialLinks"];
    benefitsOffered: string[];
    cultureMedia: PublicImage[];
    publicContactEmail: string | null;
    publicContactPhone: string | null;
    isHiringOverseas: boolean;
  };
};

export type PublicCompanyListItem = Pick<PublicCompany, "id" | "slug" | "name" | "industryName" | "countryCode" | "city" | "logo" | "verifiedAt"> & {
  tagline: string | null;
  isHiringOverseas: boolean;
  hiringRegions: string[];
};

type FileForUrl = typeof files.$inferSelect;

function toPublicImage(file: FileForUrl | null | undefined): PublicImage | null {
  if (!file || file.visibility !== "public" || file.deletedAt || file.scanStatus === "infected") return null;
  return { id: file.id, url: fileUrl(file, { variant: "lg" }), thumbnailUrl: thumbnailUrl(file), width: file.width, height: file.height };
}

/** Public, image-type file of this organisation (or uploaded by the actor); made public if needed. */
async function requirePublicOrgImage(tx: DbOrTx, fileId: string, organizationId: string, actorUserId: string): Promise<string> {
  const file = await requireUploadedFile(fileId, { purposes: ["org_logo"], organizationId, ownerUserId: actorUserId }, tx);
  if (file.visibility !== "public") await setFileVisibility(file.id, "public", { actorUserId, tx });
  return file.id;
}

// ---------------------------------------------------------------------------
// Company profile
// ---------------------------------------------------------------------------

export async function getCompanyProfile(actor: OrgActor, organizationId: string): Promise<CompanyProfileRow | null> {
  await authorizeOrg(actor, organizationId, { member: "any", staff: "orgs.view", types: EMPLOYER_ONLY });
  const [row] = await db.select().from(companyProfiles).where(eq(companyProfiles.organizationId, organizationId)).limit(1);
  return row ?? null;
}

/**
 * Update the employer profile (employer.company.manage / staff orgs.manage). aboutHtml is sanitised;
 * the cover and culture media must be public images (purpose org_logo) of this organisation.
 */
export async function updateCompanyProfile(actor: OrgActor, organizationId: string, input: CompanyProfileInput): Promise<void> {
  await db.transaction(async (tx) => {
    const access = await authorizeOrg(actor, organizationId, PROFILE_RULE, { tx, lock: true });
    await assertCountryExists(tx, input.headquartersCountryCode, "headquartersCountryCode");
    if (input.hiringRegions.length) {
      const found = await tx.select({ code: countries.code }).from(countries).where(inArray(countries.code, input.hiringRegions));
      if (found.length !== input.hiringRegions.length) throw validationError("Choose valid hiring countries.", { hiringRegions: ["Choose valid countries"] });
    }
    if (input.typicalJobCategoryIds.length) {
      const found = await tx.select({ id: jobCategories.id }).from(jobCategories).where(inArray(jobCategories.id, input.typicalJobCategoryIds));
      if (found.length !== input.typicalJobCategoryIds.length) throw validationError("Choose valid job categories.", { typicalJobCategoryIds: ["Choose valid categories"] });
    }
    if (input.defaultCurrency) {
      const [currency] = await tx.select({ code: currencies.code }).from(currencies).where(eq(currencies.code, input.defaultCurrency)).limit(1);
      if (!currency) throw validationError("Choose a valid currency.", { defaultCurrency: ["Choose a valid currency"] });
    }
    const coverFileId = input.coverFileId ? await requirePublicOrgImage(tx, input.coverFileId, organizationId, access.actorUserId) : null;
    const cultureMediaFileIds: string[] = [];
    for (const id of input.cultureMediaFileIds) cultureMediaFileIds.push(await requirePublicOrgImage(tx, id, organizationId, access.actorUserId));

    const values = {
      companySize: input.companySize ?? null,
      foundedYear: input.foundedYear ?? null,
      headquartersCountryCode: input.headquartersCountryCode ?? null,
      hiringRegions: input.hiringRegions,
      typicalRoles: input.typicalRoles,
      typicalJobCategoryIds: input.typicalJobCategoryIds,
      employerBrandingTagline: input.employerBrandingTagline ?? null,
      aboutHtml: sanitizeRichText(input.aboutHtml) || null,
      coverFileId,
      socialLinks: Object.fromEntries(Object.entries(input.socialLinks ?? {}).filter(([, v]) => !!v)) as CompanyProfileRow["socialLinks"],
      benefitsOffered: input.benefitsOffered,
      cultureMediaFileIds,
      publicContactEmail: input.publicContactEmail ?? null,
      publicContactPhone: input.publicContactPhone ?? null,
      isHiringOverseas: input.isHiringOverseas,
      defaultCurrency: input.defaultCurrency ?? null,
    };
    await tx.insert(companyProfiles).values({ organizationId, ...values }).onConflictDoUpdate({ target: companyProfiles.organizationId, set: values });
    await audit({
      action: "employer.profile_updated",
      entityType: "organization",
      entityId: organizationId,
      organizationId,
      actorUserId: access.actorUserId,
      actorType: access.via === "staff" ? "staff" : "user",
      tx,
    });
  });
}

// ---------------------------------------------------------------------------
// Branches
// ---------------------------------------------------------------------------

const BRANCH_CONSTRAINTS = {
  company_branches_org_name_uq: "A branch with this name already exists.",
  company_branches_org_hq_uq: "Only one branch can be the headquarters.",
};

function branchValues(input: CompanyBranchInput) {
  return {
    name: input.name,
    countryCode: input.countryCode,
    stateRegion: input.stateRegion ?? null,
    city: input.city ?? null,
    addressLine1: input.addressLine1 ?? null,
    addressLine2: input.addressLine2 ?? null,
    postalCode: input.postalCode ?? null,
    timezone: input.timezone ?? null,
    isHeadquarters: input.isHeadquarters,
    contactName: input.contactName ?? null,
    contactEmail: input.contactEmail ?? null,
    contactPhone: input.contactPhone ?? null,
  };
}

/** Branches of an employer (any member, staff orgs.view). Inactive branches only when asked. */
export async function listBranches(actor: OrgActor, organizationId: string, opts: { includeInactive?: boolean } = {}): Promise<CompanyBranchRow[]> {
  await authorizeOrg(actor, organizationId, { member: "any", staff: "orgs.view", types: EMPLOYER_ONLY });
  return db
    .select()
    .from(companyBranches)
    .where(and(eq(companyBranches.organizationId, organizationId), opts.includeInactive ? undefined : eq(companyBranches.isActive, true)))
    .orderBy(desc(companyBranches.isHeadquarters), asc(companyBranches.name));
}

export async function createBranch(actor: OrgActor, organizationId: string, input: CompanyBranchInput): Promise<CompanyBranchRow> {
  return withConstraintMessages(
    () =>
      db.transaction(async (tx) => {
        const access = await authorizeOrg(actor, organizationId, PROFILE_RULE, { tx, lock: true });
        await assertCountryExists(tx, input.countryCode);
        if (input.isHeadquarters) {
          await tx.update(companyBranches).set({ isHeadquarters: false }).where(and(eq(companyBranches.organizationId, organizationId), eq(companyBranches.isHeadquarters, true)));
        }
        const [row] = await tx.insert(companyBranches).values({ organizationId, ...branchValues(input) }).returning();
        await audit({ action: "employer.branch_created", entityType: "company_branch", entityId: row!.id, organizationId, actorUserId: access.actorUserId, metadata: { name: row!.name }, tx });
        return row!;
      }),
    BRANCH_CONSTRAINTS,
  );
}

export async function updateBranch(actor: OrgActor, branchId: string, input: CompanyBranchInput): Promise<void> {
  await withConstraintMessages(
    () =>
      db.transaction(async (tx) => {
        const [branch] = await tx.select().from(companyBranches).where(eq(companyBranches.id, branchId)).limit(1).for("update");
        if (!branch) throw notFoundError("Branch not found.");
        const access = await authorizeOrg(actor, branch.organizationId, PROFILE_RULE, { tx, lock: true });
        await assertCountryExists(tx, input.countryCode);
        if (input.isHeadquarters && !branch.isHeadquarters) {
          await tx
            .update(companyBranches)
            .set({ isHeadquarters: false })
            .where(and(eq(companyBranches.organizationId, branch.organizationId), eq(companyBranches.isHeadquarters, true)));
        }
        await tx.update(companyBranches).set(branchValues(input)).where(eq(companyBranches.id, branch.id));
        await audit({ action: "employer.branch_updated", entityType: "company_branch", entityId: branch.id, organizationId: branch.organizationId, actorUserId: access.actorUserId, tx });
      }),
    BRANCH_CONSTRAINTS,
  );
}

/** Deactivate (hidden from selectors, kept for history) or reactivate a branch. A deactivated branch stops being the headquarters. */
export async function setBranchActive(actor: OrgActor, branchId: string, isActive: boolean): Promise<void> {
  await db.transaction(async (tx) => {
    const [branch] = await tx.select().from(companyBranches).where(eq(companyBranches.id, branchId)).limit(1).for("update");
    if (!branch) throw notFoundError("Branch not found.");
    const access = await authorizeOrg(actor, branch.organizationId, PROFILE_RULE, { tx });
    await tx
      .update(companyBranches)
      .set({ isActive, ...(isActive ? {} : { isHeadquarters: false }) })
      .where(eq(companyBranches.id, branch.id));
    await audit({
      action: isActive ? "employer.branch_reactivated" : "employer.branch_deactivated",
      entityType: "company_branch",
      entityId: branch.id,
      organizationId: branch.organizationId,
      actorUserId: access.actorUserId,
      tx,
    });
  });
}

// ---------------------------------------------------------------------------
// Contracts (Venkat Sai staff)
// ---------------------------------------------------------------------------

async function contractTermsFromInput(tx: DbOrTx, terms: EmployerContractInput["terms"]): Promise<EmployerContractRow["terms"]> {
  if (!terms) return {};
  if (terms.currency) {
    const [currency] = await tx.select({ code: currencies.code }).from(currencies).where(eq(currencies.code, terms.currency)).limit(1);
    if (!currency) throw validationError("Choose a valid currency.", { "terms.currency": ["Choose a valid currency"] });
  }
  const currency = terms.currency;
  return {
    ...(currency ? { currency } : {}),
    fees: terms.fees.map((fee) => ({
      label: fee.label,
      model: fee.model,
      ...(fee.amount !== undefined && currency ? { amountMinor: toMinorUnits(fee.amount, currency) } : {}),
      ...(fee.rateBasisPoints !== undefined ? { rateBasisPoints: fee.rateBasisPoints } : {}),
      ...(fee.notes ? { notes: fee.notes } : {}),
    })),
    ...(terms.paymentTermsDays !== undefined ? { paymentTermsDays: terms.paymentTermsDays } : {}),
    ...(terms.sla ? { sla: { ...terms.sla } } : {}),
    ...(terms.notes ? { notes: terms.notes } : {}),
  };
}

async function assertActiveStaffUser(tx: DbOrTx, userId: string | undefined): Promise<void> {
  if (!userId) return;
  const [row] = await tx
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, userId), eq(users.isStaff, true), eq(users.status, "active")))
    .limit(1);
  if (!row) throw validationError("Choose an active Venkat Sai team member.", { accountManagerUserId: ["Choose an active team member"] });
}

async function contractValues(tx: DbOrTx, staff: StaffContext, organizationId: string, input: EmployerContractInput) {
  await assertActiveStaffUser(tx, input.accountManagerUserId);
  const documentFileId = input.documentFileId
    ? (await requireUploadedFile(input.documentFileId, { purposes: ["org_document"], organizationId, ownerUserId: staff.user.id }, tx)).id
    : null;
  return {
    contractType: input.contractType,
    title: input.title,
    reference: input.reference ?? null,
    startsOn: input.startsOn ?? null,
    endsOn: input.endsOn ?? null,
    autoRenew: input.autoRenew,
    terms: await contractTermsFromInput(tx, input.terms),
    documentFileId,
    signedAt: input.signedOn ? new Date(`${input.signedOn}T00:00:00.000Z`) : null,
    signedByName: input.signedByName ?? null,
    accountManagerUserId: input.accountManagerUserId ?? null,
  };
}

/** Contracts of an employer: employer members with employer.billing.view, staff with orgs.view or commercial.view. */
export async function listEmployerContracts(actor: OrgActor, organizationId: string): Promise<EmployerContractRow[]> {
  await authorizeOrg(actor, organizationId, { member: { employer: "employer.billing.view" }, staff: ["orgs.view", "commercial.view"], staffMode: "any", types: EMPLOYER_ONLY });
  return db.select().from(employerContracts).where(eq(employerContracts.organizationId, organizationId)).orderBy(desc(employerContracts.createdAt));
}

/** Staff (orgs.manage) record a contract (status draft until activated). */
export async function createEmployerContract(staff: StaffContext, organizationId: string, input: EmployerContractInput): Promise<EmployerContractRow> {
  assertStaff(staff, "orgs.manage");
  return db.transaction(async (tx) => {
    await authorizeOrg(staff, organizationId, { member: null, staff: "orgs.manage", types: EMPLOYER_ONLY }, { tx });
    const values = await contractValues(tx, staff, organizationId, input);
    const [row] = await tx.insert(employerContracts).values({ organizationId, ...values, status: "draft", createdByUserId: staff.user.id }).returning();
    await audit({
      action: "employer.contract_created",
      entityType: "employer_contract",
      entityId: row!.id,
      organizationId,
      actorUserId: staff.user.id,
      actorType: "staff",
      metadata: { contractType: row!.contractType, title: row!.title },
      tx,
    });
    return row!;
  });
}

async function loadContractForUpdate(tx: DbOrTx, contractId: string): Promise<EmployerContractRow> {
  const [row] = await tx.select().from(employerContracts).where(eq(employerContracts.id, contractId)).limit(1).for("update");
  if (!row) throw notFoundError("Contract not found.");
  return row;
}

/** Staff (orgs.manage) edit a draft or active contract (changes to active contracts are audited). */
export async function updateEmployerContract(staff: StaffContext, contractId: string, input: EmployerContractInput): Promise<void> {
  assertStaff(staff, "orgs.manage");
  await db.transaction(async (tx) => {
    const contract = await loadContractForUpdate(tx, contractId);
    if (contract.status !== "draft" && contract.status !== "active") throw invalidStateError("Expired or terminated contracts cannot be edited.");
    if (contract.status === "active" && !input.startsOn) throw validationError("An active contract needs a start date.", { startsOn: ["Required for an active contract"] });
    const values = await contractValues(tx, staff, contract.organizationId, input);
    await tx.update(employerContracts).set(values).where(eq(employerContracts.id, contract.id));
    await audit({
      action: "employer.contract_updated",
      entityType: "employer_contract",
      entityId: contract.id,
      organizationId: contract.organizationId,
      actorUserId: staff.user.id,
      actorType: "staff",
      metadata: { status: contract.status },
      tx,
    });
  });
}

/** Staff (orgs.manage) activate a draft contract (needs a start date). */
export async function activateEmployerContract(staff: StaffContext, contractId: string): Promise<void> {
  assertStaff(staff, "orgs.manage");
  await db.transaction(async (tx) => {
    const contract = await loadContractForUpdate(tx, contractId);
    if (contract.status !== "draft") throw invalidStateError("Only a draft contract can be activated.");
    if (!contract.startsOn) throw invalidStateError("Add a start date before activating the contract.");
    await tx.update(employerContracts).set({ status: "active" }).where(eq(employerContracts.id, contract.id));
    await audit({ action: "employer.contract_activated", entityType: "employer_contract", entityId: contract.id, organizationId: contract.organizationId, actorUserId: staff.user.id, actorType: "staff", tx });
  });
}

/** Staff (orgs.manage) terminate a draft or active contract with a reason. */
export async function terminateEmployerContract(staff: StaffContext, input: { contractId: string; reason: string }): Promise<void> {
  assertStaff(staff, "orgs.manage");
  await db.transaction(async (tx) => {
    const contract = await loadContractForUpdate(tx, input.contractId);
    if (contract.status !== "draft" && contract.status !== "active") throw invalidStateError("This contract has already ended.");
    await tx
      .update(employerContracts)
      .set({ status: "terminated", terminatedAt: new Date(), terminationReason: input.reason })
      .where(eq(employerContracts.id, contract.id));
    await audit({
      action: "employer.contract_terminated",
      entityType: "employer_contract",
      entityId: contract.id,
      organizationId: contract.organizationId,
      actorUserId: staff.user.id,
      actorType: "staff",
      metadata: { reason: input.reason, previousStatus: contract.status },
      tx,
    });
  });
}

// ---------------------------------------------------------------------------
// Public employer pages
// ---------------------------------------------------------------------------

/** Condition for organisations that may appear publicly: verified (not lapsed), public page on, not deleted. */
function publiclyListable(now: Date): SQL {
  return and(
    eq(organizations.status, "verified"),
    eq(organizations.isPublic, true),
    isNull(organizations.deletedAt),
    or(isNull(organizations.verificationExpiresAt), gt(organizations.verificationExpiresAt, now)),
  )!;
}

/**
 * Public company page data by slug — only for verified employers whose public page is enabled.
 * Registration / tax numbers, addresses, internal contacts and metadata are never included.
 */
export async function getPublicCompany(slug: string, now: Date = new Date()): Promise<PublicCompany | null> {
  const hqCountries = alias(countries, "hq_countries");
  const [row] = await db
    .select({ org: organizations, profile: companyProfiles, industryName: industries.name, countryName: countries.name, hqCountryName: hqCountries.name })
    .from(organizations)
    .innerJoin(companyProfiles, eq(companyProfiles.organizationId, organizations.id))
    .leftJoin(industries, eq(industries.id, organizations.industryId))
    .leftJoin(countries, eq(countries.code, organizations.countryCode))
    .leftJoin(hqCountries, eq(hqCountries.code, companyProfiles.headquartersCountryCode))
    .where(and(eq(organizations.slug, slug), eq(organizations.type, "employer"), publiclyListable(now)))
    .limit(1);
  if (!row) return null;

  const fileIds = [row.org.logoFileId, row.profile.coverFileId, ...row.profile.cultureMediaFileIds].filter((v): v is string => !!v);
  const fileRows = fileIds.length ? await db.select().from(files).where(inArray(files.id, fileIds)) : [];
  const byId = new Map(fileRows.map((f) => [f.id, f]));
  const image = (id: string | null) => (id ? toPublicImage(byId.get(id)) : null);

  return {
    id: row.org.id,
    slug: row.org.slug,
    name: row.org.name,
    description: row.org.description,
    websiteUrl: row.org.websiteUrl,
    industryName: row.industryName,
    countryCode: row.org.countryCode,
    countryName: row.countryName,
    city: row.org.city,
    logo: image(row.org.logoFileId),
    verifiedAt: row.org.verifiedAt,
    profile: {
      companySize: row.profile.companySize,
      foundedYear: row.profile.foundedYear,
      headquartersCountryCode: row.profile.headquartersCountryCode,
      headquartersCountryName: row.hqCountryName,
      hiringRegions: row.profile.hiringRegions,
      typicalRoles: row.profile.typicalRoles,
      employerBrandingTagline: row.profile.employerBrandingTagline,
      aboutHtml: row.profile.aboutHtml,
      cover: image(row.profile.coverFileId),
      socialLinks: row.profile.socialLinks,
      benefitsOffered: row.profile.benefitsOffered,
      cultureMedia: row.profile.cultureMediaFileIds.map((id) => image(id)).filter((v): v is PublicImage => !!v),
      publicContactEmail: row.profile.publicContactEmail,
      publicContactPhone: row.profile.publicContactPhone,
      isHiringOverseas: row.profile.isHiringOverseas,
    },
  };
}

/** Public employer directory (verified + public only). */
export async function listPublicCompanies(
  filters: { q?: string; countryCode?: string; hiringRegion?: string; overseasOnly?: boolean },
  page: PageQuery,
  now: Date = new Date(),
): Promise<Paginated<PublicCompanyListItem>> {
  const where: SQL[] = [eq(organizations.type, "employer"), publiclyListable(now)];
  if (filters.q?.trim()) where.push(ilike(organizations.name, `%${filters.q.trim().replace(/[%_\\]/g, "")}%`));
  if (filters.countryCode) where.push(eq(organizations.countryCode, filters.countryCode.toUpperCase()));
  if (filters.hiringRegion) where.push(sql`${companyProfiles.hiringRegions} @> array[${filters.hiringRegion.toUpperCase()}]::text[]`);
  if (filters.overseasOnly) where.push(eq(companyProfiles.isHiringOverseas, true));
  const condition = and(...where);
  const [rows, total] = await Promise.all([
    db
      .select({ org: organizations, profile: companyProfiles, industryName: industries.name, logo: files })
      .from(organizations)
      .innerJoin(companyProfiles, eq(companyProfiles.organizationId, organizations.id))
      .leftJoin(industries, eq(industries.id, organizations.industryId))
      .leftJoin(files, eq(files.id, organizations.logoFileId))
      .where(condition)
      .orderBy(asc(organizations.name))
      .limit(page.pageSize)
      .offset(page.offset),
    db.select({ value: count() }).from(organizations).innerJoin(companyProfiles, eq(companyProfiles.organizationId, organizations.id)).where(condition),
  ]);
  return paginated(
    rows.map((r) => ({
      id: r.org.id,
      slug: r.org.slug,
      name: r.org.name,
      industryName: r.industryName,
      countryCode: r.org.countryCode,
      city: r.org.city,
      logo: toPublicImage(r.logo),
      verifiedAt: r.org.verifiedAt,
      tagline: r.profile.employerBrandingTagline,
      isHiringOverseas: r.profile.isHiringOverseas,
      hiringRegions: r.profile.hiringRegions,
    })),
    total[0]?.value ?? 0,
    page,
  );
}
