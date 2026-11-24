import "server-only";

import { and, asc, count, desc, eq, ilike, inArray, isNull, ne, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { db, type DbOrTx } from "@/db";
import { billingProfiles, currencies, cvSubmissions, invoiceLines, invoices, organizations } from "@/db/schema";
import type { EmployerKind } from "@/db/schema/_constants";
import type { CvSubmissionStatus } from "@/db/schema/cv-submissions";
import { ActionError } from "@/lib/actions";
import { paginated, type PageQuery, type Paginated } from "@/lib/http";
import { audit } from "@/modules/audit";
import type { OrgContext, StaffContext } from "@/modules/identity/authz";

import { assertOrgBilling, assertStaff } from "./access";
import { getBillingProfile, type BillingProfileRow } from "./billing-profiles";
import { getCommercialConfig, getSellerDetails } from "./config";
import { invalidState, notFound } from "./errors";
import { buildTaxContext, deleteDraftInvoice, issueInvoiceTx, lockInvoice, PAYABLE_STATUSES, saveDraftInvoiceTx, type InvoiceRow } from "./invoices";
import { formatMinorPlain, minorUnitsFor } from "./money";
import { priceInvoice } from "./pricing";
import {
  buildWorkerInvoiceLines,
  describeConflict,
  findDoubleInvoicing,
  INVOICEABLE_WORKER_STATUSES,
  isInvoiceableWorkerStatus,
  pickWorkerInvoiceCurrency,
  WORKER_INVOICE_REFERENCE_TYPE,
  type ExistingWorkerLine,
  type InvoiceableWorker,
  type WorkerInvoiceListItem,
  type WorkerInvoiceWorker,
} from "./worker-invoices-rules";
import type { InvoiceableWorkerFilters, WorkerInvoiceFormInput, WorkerInvoiceListFilters } from "./worker-invoices-schemas";

/**
 * Per-worker invoices for travel agencies and companies (B2B only — workers are never invoiced).
 *
 * Staff tick the workers supplied to one employer organisation (CV submissions at selected / medical / visa / ticket /
 * departed), enter an amount per worker and a currency, and save a draft or issue at once. Everything money-related
 * goes through the existing invoice service: saveDraftInvoiceTx prices the lines with the tax engine, issueInvoiceTx
 * freezes buyer + seller details and assigns the GST number. Each line bills one worker (referenceType "cv_submission",
 * referenceId = submission id); the worker's placedOrganizationId is set to the organisation.
 *
 * Double billing: a worker is refused when a non-void invoice (draft included) of the same organisation already bills
 * them. The submission rows are locked first, so two staff saving at once cannot both pass the check.
 *
 * Permissions: commercial.invoices to create, issue or delete drafts (and to see the worker picker); commercial.view
 * to list; organisation members with the billing permission see their own issued worker invoices.
 */

export const WORKER_INVOICES_ADMIN_PATH = "/admin/commercial/worker-invoices";

const PICKER_LIMIT = 50;

function escapeLike(q: string): string {
  return q.trim().replace(/[\\%_]/g, (m) => `\\${m}`);
}

const hasWorkerLines = sql`exists (select 1 from ${invoiceLines} where ${invoiceLines.invoiceId} = ${invoices.id} and ${invoiceLines.referenceType} = ${WORKER_INVOICE_REFERENCE_TYPE})`;

// ---------------------------------------------------------------------------
// Organisations and readiness
// ---------------------------------------------------------------------------

export type WorkerInvoiceOrganization = { id: string; name: string; kind: EmployerKind; billingCurrency: string | null; hasBillingProfile: boolean };

/** Travel agencies and companies that can be billed (employer organisations, not deleted). */
export async function listWorkerInvoiceOrganizations(ctx: StaffContext): Promise<WorkerInvoiceOrganization[]> {
  assertStaff(ctx, "commercial.invoices");
  const rows = await db
    .select({ id: organizations.id, name: organizations.name, employerKind: organizations.employerKind, currency: billingProfiles.currency, profileId: billingProfiles.organizationId })
    .from(organizations)
    .leftJoin(billingProfiles, eq(billingProfiles.organizationId, organizations.id))
    .where(and(eq(organizations.type, "employer"), isNull(organizations.deletedAt)))
    .orderBy(asc(organizations.name))
    .limit(2000);
  return rows.map((r) => ({ id: r.id, name: r.name, kind: r.employerKind ?? "direct_company", billingCurrency: r.currency ?? null, hasBillingProfile: Boolean(r.profileId) }));
}

export type WorkerInvoiceReadiness = {
  organization: { id: string; name: string; kind: EmployerKind; phone: string | null; email: string | null };
  billingProfile: BillingProfileRow | null;
  /** Prefill for the billing details form when the organisation has none yet (from the organisation record). */
  billingDefaults: {
    legalName: string;
    billingEmail: string | null;
    billingPhone: string | null;
    addressLine1: string | null;
    addressLine2: string | null;
    city: string | null;
    stateRegion: string | null;
    postalCode: string | null;
    countryCode: string | null;
    taxId: string | null;
  };
  /** Stop the invoice being issued (a draft can still be saved). */
  blockers: string[];
  /** Worth knowing before issuing; they do not stop it. */
  notes: { message: string; href: string; linkLabel: string }[];
};

/**
 * Can an invoice for this organisation be issued now? Same rules as issueInvoiceTx: billing details are required and
 * the tax engine must find the rates (problems listed in plain words). Seller details without a GSTIN or address do
 * not stop issuing (the invoice is then issued without GST), but staff are told. Null for unknown organisations.
 */
export async function getWorkerInvoiceReadiness(ctx: StaffContext, organizationId: string): Promise<WorkerInvoiceReadiness | null> {
  assertStaff(ctx, "commercial.invoices");
  const [org] = await db
    .select()
    .from(organizations)
    .where(and(eq(organizations.id, organizationId), eq(organizations.type, "employer"), isNull(organizations.deletedAt)))
    .limit(1);
  if (!org) return null;
  const [profile, seller, config] = await Promise.all([getBillingProfile(org.id), getSellerDetails(), getCommercialConfig()]);
  const blockers: string[] = [];
  if (!profile) {
    blockers.push(`${org.name} has no billing details yet (legal name, address, tax number). Add them below. You can save a draft now.`);
  } else {
    const taxCtx = await buildTaxContext(db, { buyer: { countryCode: profile.countryCode, stateCode: profile.stateCode, taxExempt: profile.taxExempt }, seller, at: new Date() });
    const probe = priceInvoice([{ description: "Check", quantity: 1, unitAmountMinor: 100, taxCode: config["commercial.default_tax_code"] }], taxCtx);
    for (const problem of probe.problems) if (!blockers.includes(problem)) blockers.push(problem);
  }
  const notes: WorkerInvoiceReadiness["notes"] = [];
  if (seller.countryCode === "IN" && !seller.taxId) {
    notes.push({ message: "Your GSTIN is not set in Seller details, so this invoice will be issued without GST.", href: "/admin/commercial/seller", linkLabel: "Open Seller details" });
  }
  if (!seller.addressLine1) {
    notes.push({ message: "Your business address is not set in Seller details. It is printed on every invoice.", href: "/admin/commercial/seller", linkLabel: "Open Seller details" });
  }
  return {
    organization: { id: org.id, name: org.name, kind: org.employerKind ?? "direct_company", phone: org.phone, email: org.email },
    billingProfile: profile,
    billingDefaults: {
      legalName: org.legalName ?? org.name,
      billingEmail: org.email,
      billingPhone: org.phone,
      addressLine1: org.addressLine1,
      addressLine2: org.addressLine2,
      city: org.city,
      stateRegion: org.stateRegion,
      postalCode: org.postalCode,
      countryCode: org.countryCode,
      taxId: org.taxId,
    },
    blockers,
    notes,
  };
}

// ---------------------------------------------------------------------------
// Worker picker
// ---------------------------------------------------------------------------

const placedOrg = alias(organizations, "placed_org");

const workerSelect = {
  id: cvSubmissions.id,
  code: cvSubmissions.code,
  name: cvSubmissions.name,
  tradeLabel: cvSubmissions.tradeLabel,
  status: cvSubmissions.status,
  passportLast4: cvSubmissions.passportNumberLast4,
  requirementTitle: cvSubmissions.requirementTitle,
  placedOrganizationId: cvSubmissions.placedOrganizationId,
  placedOrganizationName: placedOrg.name,
};

type WorkerRow = { id: string; code: string; name: string; tradeLabel: string; status: CvSubmissionStatus; passportLast4: string | null; requirementTitle: string | null; placedOrganizationId: string | null; placedOrganizationName: string | null };

/** Invoice lines (of any invoice) that bill these workers, with their invoice's status and organisation. */
async function existingWorkerLines(tx: DbOrTx, submissionIds: readonly string[]): Promise<ExistingWorkerLine[]> {
  if (!submissionIds.length) return [];
  const rows = await tx
    .select({
      submissionId: invoiceLines.referenceId,
      invoiceId: invoices.id,
      invoiceCode: invoices.code,
      invoiceStatus: invoices.status,
      organizationId: invoices.organizationId,
      documentType: invoices.documentType,
    })
    .from(invoiceLines)
    .innerJoin(invoices, eq(invoices.id, invoiceLines.invoiceId))
    .where(and(eq(invoiceLines.referenceType, WORKER_INVOICE_REFERENCE_TYPE), inArray(invoiceLines.referenceId, [...submissionIds])))
    .orderBy(desc(invoices.createdAt));
  return rows.map((r) => ({ ...r, submissionId: r.submissionId ?? "" }));
}

function toInvoiceableWorker(row: WorkerRow, conflicts: Map<string, ExistingWorkerLine>): InvoiceableWorker {
  const conflict = conflicts.get(row.id) ?? null;
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    tradeLabel: row.tradeLabel,
    status: row.status,
    invoiceable: isInvoiceableWorkerStatus(row.status),
    passportLast4: row.passportLast4,
    requirementTitle: row.requirementTitle,
    placedOrganizationId: row.placedOrganizationId,
    placedOrganizationName: row.placedOrganizationName ?? null,
    alreadyInvoiced: conflict ? { invoiceId: conflict.invoiceId, code: conflict.invoiceCode, status: conflict.invoiceStatus } : null,
  };
}

/**
 * Workers that can be invoiced (selected, medical, visa, ticket, departed), for the worker picker (commercial.invoices).
 * Filters: only those already placed with the organisation, a requirement poster, a search by name, reference or the
 * last digits of the passport number. Workers placed with the chosen organisation come first, then the most recent
 * stage changes. `includeIds` (preselected or already on the draft) are returned separately whatever the filters.
 * `alreadyInvoiced` marks workers a non-void invoice of the organisation already bills (`excludeInvoiceId` = the
 * draft being edited). No phone numbers, no full passport numbers.
 */
export async function listInvoiceableWorkers(
  ctx: StaffContext,
  input: { organizationId?: string | null; filters?: InvoiceableWorkerFilters; includeIds?: readonly string[]; excludeInvoiceId?: string | null; limit?: number },
): Promise<{ items: InvoiceableWorker[]; total: number; included: InvoiceableWorker[] }> {
  assertStaff(ctx, "commercial.invoices");
  const filters = input.filters ?? {};
  const organizationId = input.organizationId ?? null;
  const where: SQL[] = [inArray(cvSubmissions.status, [...INVOICEABLE_WORKER_STATUSES])];
  if (filters.placed && organizationId) where.push(eq(cvSubmissions.placedOrganizationId, organizationId));
  if (filters.requirement) where.push(eq(cvSubmissions.requirementEntryId, filters.requirement));
  if (filters.q) {
    const q = escapeLike(filters.q);
    const conditions: SQL[] = [ilike(cvSubmissions.name, `%${q}%`), ilike(cvSubmissions.code, `%${q}%`)];
    if (/^[A-Za-z0-9]{1,4}$/.test(filters.q.trim())) conditions.push(ilike(cvSubmissions.passportNumberLast4, `%${q}`));
    where.push(or(...conditions)!);
  }
  const condition = and(...where);
  const order = [
    ...(organizationId ? [sql`case when ${cvSubmissions.placedOrganizationId} = ${organizationId} then 0 else 1 end`] : []),
    sql`${cvSubmissions.statusChangedAt} desc nulls last`,
    desc(cvSubmissions.createdAt),
  ];
  const includeIds = [...new Set(input.includeIds ?? [])].filter((id) => /^[0-9a-f-]{36}$/i.test(id));
  // limit 0: only the `includeIds` workers (e.g. a preselected worker before the organisation is chosen).
  const limit = Math.min(Math.max(input.limit ?? PICKER_LIMIT, 0), 200);
  const [rows, totals, includedRows] = await Promise.all([
    limit
      ? db.select(workerSelect).from(cvSubmissions).leftJoin(placedOrg, eq(placedOrg.id, cvSubmissions.placedOrganizationId)).where(condition).orderBy(...order).limit(limit)
      : Promise.resolve([]),
    limit ? db.select({ value: count() }).from(cvSubmissions).where(condition) : Promise.resolve([{ value: 0 }]),
    includeIds.length ? db.select(workerSelect).from(cvSubmissions).leftJoin(placedOrg, eq(placedOrg.id, cvSubmissions.placedOrganizationId)).where(inArray(cvSubmissions.id, includeIds)) : Promise.resolve([]),
  ]);
  const ids = [...new Set([...rows.map((r) => r.id), ...includedRows.map((r) => r.id)])];
  const conflicts = new Map<string, ExistingWorkerLine>();
  if (organizationId && ids.length) {
    for (const c of findDoubleInvoicing(ids, await existingWorkerLines(db, ids), { organizationId, excludeInvoiceId: input.excludeInvoiceId ?? null })) conflicts.set(c.submissionId, c);
  }
  const byInclude = new Map(includedRows.map((r) => [r.id, r]));
  return {
    items: rows.map((r) => toInvoiceableWorker(r, conflicts)),
    total: totals[0]?.value ?? 0,
    included: includeIds.map((id) => byInclude.get(id)).filter((r): r is WorkerRow => Boolean(r)).map((r) => toInvoiceableWorker(r, conflicts)),
  };
}

/** Requirement posters that invoiceable workers applied from (picker filter options). */
export async function listInvoiceableRequirementOptions(ctx: StaffContext): Promise<{ value: string; label: string }[]> {
  assertStaff(ctx, "commercial.invoices");
  const rows = await db
    .selectDistinct({ id: cvSubmissions.requirementEntryId, title: cvSubmissions.requirementTitle })
    .from(cvSubmissions)
    .where(and(inArray(cvSubmissions.status, [...INVOICEABLE_WORKER_STATUSES]), sql`${cvSubmissions.requirementEntryId} is not null`))
    .orderBy(asc(cvSubmissions.requirementTitle))
    .limit(300);
  const seen = new Set<string>();
  const out: { value: string; label: string }[] = [];
  for (const r of rows) {
    if (!r.id || seen.has(r.id)) continue;
    seen.add(r.id);
    out.push({ value: r.id, label: r.title ?? "Requirement" });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Save draft / issue
// ---------------------------------------------------------------------------

export type SaveWorkerInvoiceResult = {
  invoice: InvoiceRow;
  issued: boolean;
  /** Why the invoice was saved as a draft instead of being issued (billing details or tax rates missing). */
  issueProblem: string | null;
};

const NOT_READY_CODES = new Set(["invoice_not_ready", "billing_profile_required"]);

/**
 * Create or update a worker invoice draft and, with `intent: "issue"`, issue it in the same transaction. When the
 * invoice cannot be issued yet (no billing details, missing tax rates) the draft is still saved and the reason is
 * returned, so nothing staff typed is lost.
 */
export async function saveWorkerInvoice(ctx: StaffContext, input: WorkerInvoiceFormInput): Promise<SaveWorkerInvoiceResult> {
  assertStaff(ctx, "commercial.invoices");
  const ids = input.lines.map((l) => l.submissionId);
  if (!ids.length) throw new ActionError("Tick at least one worker.", { fieldErrors: { lines: ["Tick at least one worker"] } });
  if (new Set(ids).size !== ids.length) throw new ActionError("A worker is ticked twice. Refresh the page and try again.", { fieldErrors: { lines: ["Duplicate worker"] } });

  return db.transaction(async (tx) => {
    const [org] = await tx
      .select({ id: organizations.id, name: organizations.name, type: organizations.type })
      .from(organizations)
      .where(and(eq(organizations.id, input.organizationId), isNull(organizations.deletedAt)))
      .limit(1);
    if (!org) throw notFound("Organisation");
    if (org.type !== "employer") throw new ActionError("Worker invoices are for travel agencies and companies.", { fieldErrors: { organizationId: ["Choose a travel agency or company"] } });

    if (input.id) {
      const existing = await lockInvoice(tx, input.id);
      if (existing.status !== "draft") throw invalidState("This invoice has already been issued. Open it to record payments, or void it and make a new one.");
      const [workerLine] = await tx
        .select({ id: invoiceLines.id })
        .from(invoiceLines)
        .where(and(eq(invoiceLines.invoiceId, existing.id), eq(invoiceLines.referenceType, WORKER_INVOICE_REFERENCE_TYPE)))
        .limit(1);
      if (!workerLine) throw invalidState("This draft is not a worker invoice. Edit it under Invoices.");
    }

    // Lock the workers (stable order: no deadlock between two staff), then check their stage.
    const workers = await tx
      .select({ id: cvSubmissions.id, name: cvSubmissions.name, tradeLabel: cvSubmissions.tradeLabel, status: cvSubmissions.status, placedOrganizationId: cvSubmissions.placedOrganizationId })
      .from(cvSubmissions)
      .where(inArray(cvSubmissions.id, ids))
      .orderBy(asc(cvSubmissions.id))
      .for("update");
    if (workers.length !== ids.length) throw new ActionError("A worker could not be found. Refresh the page and try again.", { fieldErrors: { lines: ["Unknown worker"] } });
    const notReady = workers.filter((w) => !isInvoiceableWorkerStatus(w.status));
    if (notReady.length) {
      const names = notReady.map((w) => w.name).join(", ");
      throw new ActionError(`${names} ${notReady.length === 1 ? "is" : "are"} not selected yet. Only workers who are selected, at medical, visa or ticket stage, or departed can be invoiced.`, {
        code: "worker_not_invoiceable",
        fieldErrors: { lines: ["Worker not selected yet"] },
      });
    }

    // Never bill a worker twice to the same organisation (unless the earlier invoice was voided).
    const conflicts = findDoubleInvoicing(ids, await existingWorkerLines(tx, ids), { organizationId: org.id, excludeInvoiceId: input.id ?? null });
    if (conflicts.length) {
      const nameOf = new Map(workers.map((w) => [w.id, w.name]));
      const list = conflicts.map((c) => describeConflict(nameOf.get(c.submissionId) ?? "Worker", c)).join(", ");
      throw new ActionError(`Already invoiced to ${org.name}: ${list}. Void that invoice first if it was wrong.`, { code: "already_invoiced", fieldErrors: { lines: ["Already invoiced"] } });
    }

    const profile = await getBillingProfile(org.id, tx);
    const currency = pickWorkerInvoiceCurrency(input.currency, profile?.currency);
    if (!currency) throw new ActionError("Choose the currency of this invoice.", { fieldErrors: { currency: ["Choose the currency"] } });
    const [currencyRow] = await tx.select({ minorUnits: currencies.minorUnits, isActive: currencies.isActive }).from(currencies).where(eq(currencies.code, currency)).limit(1);
    if (!currencyRow?.isActive) throw new ActionError("Choose an active currency.", { fieldErrors: { currency: ["Unknown or inactive currency"] } });

    const built = buildWorkerInvoiceLines(workers, input.lines, currency, currencyRow.minorUnits);
    if (!built.ok) throw new ActionError(built.error, { fieldErrors: built.fieldErrors });

    const draft = await saveDraftInvoiceTx(tx, ctx.user.id, {
      id: input.id,
      organizationId: org.id,
      currency,
      lines: built.lines,
      notes: input.notes,
      taxTreatment: "auto",
    });

    // The workers were supplied to this organisation.
    const moved = workers.filter((w) => w.placedOrganizationId !== org.id);
    if (moved.length) {
      await tx
        .update(cvSubmissions)
        .set({ placedOrganizationId: org.id })
        .where(inArray(cvSubmissions.id, moved.map((w) => w.id)));
      for (const w of moved) {
        await audit({
          action: "cv_submission.placed_organization_set",
          entityType: "cv_submission",
          entityId: w.id,
          organizationId: org.id,
          actorUserId: ctx.user.id,
          actorType: "staff",
          metadata: { from: w.placedOrganizationId, to: org.id, invoiceId: draft.id },
          tx,
        });
      }
    }

    let invoice = draft;
    let issued = false;
    let issueProblem: string | null = null;
    if (input.intent === "issue") {
      try {
        // Savepoint: a buyer or tax problem rolls back the issue only; the draft above stays.
        invoice = await tx.transaction((sp) => issueInvoiceTx(sp, draft.id, { actorUserId: ctx.user.id }));
        issued = true;
      } catch (error) {
        if (error instanceof ActionError && error.code && NOT_READY_CODES.has(error.code)) issueProblem = error.message;
        else throw error;
      }
    }

    await audit({
      action: issued ? "commercial.worker_invoice_issued" : "commercial.worker_invoice_saved",
      entityType: "invoice",
      entityId: invoice.id,
      organizationId: org.id,
      actorUserId: ctx.user.id,
      actorType: "staff",
      metadata: { workers: ids.length, submissionIds: ids, currency, totalMinor: invoice.totalMinor, code: invoice.code, issueBlocked: Boolean(issueProblem) },
      tx,
    });
    return { invoice, issued, issueProblem };
  });
}

/** Delete a worker invoice draft (commercial.invoices). Issued invoices are voided from the invoice page instead. */
export async function deleteWorkerInvoiceDraft(ctx: StaffContext, invoiceId: string): Promise<void> {
  assertStaff(ctx, "commercial.invoices");
  const [row] = await db.select({ id: invoiceLines.id }).from(invoiceLines).where(and(eq(invoiceLines.invoiceId, invoiceId), eq(invoiceLines.referenceType, WORKER_INVOICE_REFERENCE_TYPE))).limit(1);
  if (!row) throw notFound("Worker invoice");
  await deleteDraftInvoice(ctx, invoiceId);
}

// ---------------------------------------------------------------------------
// Lists and detail
// ---------------------------------------------------------------------------

const listSelect = {
  id: invoices.id,
  code: invoices.code,
  status: invoices.status,
  currency: invoices.currency,
  totalMinor: invoices.totalMinor,
  taxMinor: invoices.taxMinor,
  amountPaidMinor: invoices.amountPaidMinor,
  issuedAt: invoices.issuedAt,
  dueAt: invoices.dueAt,
  createdAt: invoices.createdAt,
  organizationId: invoices.organizationId,
  organizationName: organizations.name,
};

/** Workers billed by each invoice, in line order (names from the CV submission, else the frozen line text). */
async function workersByInvoice(invoiceIds: readonly string[]): Promise<Map<string, WorkerInvoiceWorker[]>> {
  const out = new Map<string, WorkerInvoiceWorker[]>();
  if (!invoiceIds.length) return out;
  const rows = await db
    .select({
      invoiceId: invoiceLines.invoiceId,
      submissionId: invoiceLines.referenceId,
      description: invoiceLines.description,
      name: cvSubmissions.name,
      tradeLabel: cvSubmissions.tradeLabel,
      code: cvSubmissions.code,
    })
    .from(invoiceLines)
    .leftJoin(cvSubmissions, sql`${cvSubmissions.id}::text = ${invoiceLines.referenceId}`)
    .where(and(inArray(invoiceLines.invoiceId, [...invoiceIds]), eq(invoiceLines.referenceType, WORKER_INVOICE_REFERENCE_TYPE)))
    .orderBy(asc(invoiceLines.invoiceId), asc(invoiceLines.sortOrder));
  for (const r of rows) {
    const list = out.get(r.invoiceId) ?? [];
    list.push({ submissionId: r.submissionId ?? "", name: r.name ?? r.description.replace(/^Recruitment service charge - /, ""), tradeLabel: r.tradeLabel ?? "", code: r.code ?? null });
    out.set(r.invoiceId, list);
  }
  return out;
}

async function workerInvoiceList(where: SQL | undefined, page: PageQuery): Promise<Paginated<WorkerInvoiceListItem>> {
  const [rows, totals] = await Promise.all([
    db
      .select(listSelect)
      .from(invoices)
      .leftJoin(organizations, eq(organizations.id, invoices.organizationId))
      .where(where)
      .orderBy(sql`${invoices.issuedAt} desc nulls first`, desc(invoices.createdAt))
      .limit(page.pageSize)
      .offset(page.offset),
    db.select({ value: count() }).from(invoices).leftJoin(organizations, eq(organizations.id, invoices.organizationId)).where(where),
  ]);
  const workers = await workersByInvoice(rows.map((r) => r.id));
  const items = rows.map(({ amountPaidMinor, ...r }) => ({
    ...r,
    outstandingMinor: PAYABLE_STATUSES.includes(r.status) ? Math.max(0, r.totalMinor - amountPaidMinor) : 0,
    workers: workers.get(r.id) ?? [],
  }));
  return paginated(items, totals[0]?.value ?? 0, page);
}

function listWhere(filters: WorkerInvoiceListFilters): SQL[] {
  const where: SQL[] = [eq(invoices.documentType, "invoice"), hasWorkerLines];
  if (filters.status === "open") where.push(inArray(invoices.status, [...PAYABLE_STATUSES]));
  else if (filters.status) where.push(eq(invoices.status, filters.status));
  if (filters.organizationId) where.push(eq(invoices.organizationId, filters.organizationId));
  if (filters.q) {
    const q = `%${escapeLike(filters.q)}%`;
    where.push(
      or(
        ilike(invoices.code, q),
        ilike(organizations.name, q),
        sql`exists (select 1 from ${invoiceLines} where ${invoiceLines.invoiceId} = ${invoices.id} and ${invoiceLines.referenceType} = ${WORKER_INVOICE_REFERENCE_TYPE} and ${invoiceLines.description} ilike ${q})`,
      )!,
    );
  }
  return where;
}

/** Worker invoices for the Command Centre (commercial.view), drafts included, newest first. */
export async function listWorkerInvoices(ctx: StaffContext, filters: WorkerInvoiceListFilters, page: PageQuery): Promise<Paginated<WorkerInvoiceListItem>> {
  assertStaff(ctx, "commercial.view");
  return workerInvoiceList(and(...listWhere(filters)), page);
}

/** The organisation's issued worker invoices (portal billing; never drafts). */
export async function listOrgWorkerInvoices(ctx: OrgContext, page: PageQuery): Promise<Paginated<WorkerInvoiceListItem>> {
  assertOrgBilling(ctx, "view");
  return workerInvoiceList(and(eq(invoices.organizationId, ctx.organization.id), ne(invoices.status, "draft"), ...listWhere({})), page);
}

export type WorkerInvoiceDetail = {
  invoice: Pick<InvoiceRow, "id" | "code" | "status" | "currency" | "subtotalMinor" | "taxMinor" | "totalMinor" | "amountPaidMinor" | "notes" | "issuedAt" | "dueAt" | "createdAt" | "organizationId">;
  outstandingMinor: number;
  organization: { id: string; name: string; kind: EmployerKind; phone: string | null; email: string | null; billingPhone: string | null } | null;
  /** One per worker line, in order; `amount` is the unit price as a plain decimal ("15000.00"). */
  lines: { submissionId: string; description: string; amount: string; amountMinor: number; taxMinor: number }[];
};

/** One worker invoice for the Command Centre (commercial.view); null when it is not a worker invoice. */
export async function getWorkerInvoice(ctx: StaffContext, invoiceId: string): Promise<WorkerInvoiceDetail | null> {
  assertStaff(ctx, "commercial.view");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(invoiceId)) return null;
  const [row] = await db
    .select({ invoice: invoices, orgName: organizations.name, orgKind: organizations.employerKind, orgPhone: organizations.phone, orgEmail: organizations.email, billingPhone: billingProfiles.billingPhone })
    .from(invoices)
    .leftJoin(organizations, eq(organizations.id, invoices.organizationId))
    .leftJoin(billingProfiles, eq(billingProfiles.organizationId, invoices.organizationId))
    .where(and(eq(invoices.id, invoiceId), eq(invoices.documentType, "invoice")))
    .limit(1);
  if (!row) return null;
  const lines = await db
    .select()
    .from(invoiceLines)
    .where(and(eq(invoiceLines.invoiceId, invoiceId), eq(invoiceLines.referenceType, WORKER_INVOICE_REFERENCE_TYPE)))
    .orderBy(asc(invoiceLines.sortOrder), asc(invoiceLines.createdAt));
  if (!lines.length) return null;
  const inv = row.invoice;
  const minorUnits = minorUnitsFor(inv.currency);
  return {
    invoice: {
      id: inv.id,
      code: inv.code,
      status: inv.status,
      currency: inv.currency,
      subtotalMinor: inv.subtotalMinor,
      taxMinor: inv.taxMinor,
      totalMinor: inv.totalMinor,
      amountPaidMinor: inv.amountPaidMinor,
      notes: inv.notes,
      issuedAt: inv.issuedAt,
      dueAt: inv.dueAt,
      createdAt: inv.createdAt,
      organizationId: inv.organizationId,
    },
    outstandingMinor: PAYABLE_STATUSES.includes(inv.status) ? Math.max(0, inv.totalMinor - inv.amountPaidMinor) : 0,
    organization: inv.organizationId && row.orgName ? { id: inv.organizationId, name: row.orgName, kind: row.orgKind ?? "direct_company", phone: row.orgPhone, email: row.orgEmail, billingPhone: row.billingPhone ?? null } : null,
    lines: lines.map((l) => ({ submissionId: l.referenceId ?? "", description: l.description, amount: formatMinorPlain(l.unitAmountMinor, minorUnits), amountMinor: l.amountMinor, taxMinor: l.taxMinor })),
  };
}
