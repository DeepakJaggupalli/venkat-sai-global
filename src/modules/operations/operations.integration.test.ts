/**
 * Integration tests for the operations services against an ISOLATED database:
 *   node scripts/test-db.mjs vsg_test_opsnotif
 *   $env:DATABASE_URL='postgres://postgres:postgres@127.0.0.1:5433/vsg_test_opsnotif'; npx vitest run src/modules/operations
 * Notifications are asserted as enqueued background tasks (the dispatch engine has its own tests).
 */
import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it, vi } from "vitest";

const enabled = /vsg_test_/.test(process.env.DATABASE_URL ?? "");

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, getAll: () => [], has: () => false, set: () => undefined, delete: () => undefined }),
  headers: async () => new Headers({ host: "localhost:3000" }),
}));

describe.skipIf(!enabled)("operations services (PostgreSQL)", async () => {
  if (!enabled) {
    it("needs DATABASE_URL pointing to a vsg_test_* database", () => undefined);
    return;
  }

  const { and, eq, gte, inArray, sql } = await import("drizzle-orm");
  const { db, pool } = await import("@/db");
  const s = await import("@/db/schema");
  const { ActionError } = await import("@/lib/actions");
  const enquiriesSvc = await import("./enquiries");
  const leadsSvc = await import("./leads");
  const requirementsSvc = await import("./requirements");
  const requirementQueries = await import("./requirements-queries");
  const supportSvc = await import("./support");
  const supportQueries = await import("./support-queries");
  const threadsSvc = await import("./threads");
  const threadQueries = await import("./threads-queries");
  const workSvc = await import("./work");
  const approvals = await import("@/modules/approvals/service");
  type StaffContext = import("@/modules/identity/authz").StaffContext;
  type OrgContext<T extends "employer" | "recruitment_partner" | "institution"> = import("@/modules/identity/authz").OrgContext<T>;
  type SessionUser = import("@/modules/identity/session").SessionUser;

  const startedAt = new Date(Date.now() - 1000);
  const run = randomUUID().slice(0, 8);
  const created = { users: [] as string[], orgs: [] as string[], roles: [] as string[] };

  await db.insert(s.currencies).values({ code: "AED", name: "UAE dirham", symbol: "AED", minorUnits: 2 }).onConflictDoNothing();

  function sessionUser(u: typeof s.users.$inferSelect): SessionUser {
    return {
      id: u.id,
      email: u.email,
      phone: u.phone,
      emailVerifiedAt: u.emailVerifiedAt,
      phoneVerifiedAt: u.phoneVerifiedAt,
      displayName: u.displayName,
      avatarFileId: null,
      status: u.status,
      isStaff: u.isStaff,
      locale: u.locale,
      timezone: u.timezone,
      hasPassword: false,
      twoFactorEnabled: false,
    };
  }

  async function makeUser(opts: { staff?: boolean; name?: string } = {}) {
    const [u] = await db
      .insert(s.users)
      .values({ displayName: opts.name ?? `Ops test ${created.users.length + 1}`, email: `ops-${randomUUID()}@vsg-test.invalid`, emailVerifiedAt: new Date(), isStaff: opts.staff ?? false })
      .returning();
    created.users.push(u!.id);
    return u!;
  }

  async function makeStaff(permissions: string[], name?: string): Promise<StaffContext> {
    const u = await makeUser({ staff: true, name });
    const [role] = await db.insert(s.roles).values({ scope: "platform", key: `ops-${randomUUID().slice(0, 12)}`, name: "Ops test role", permissions }).returning();
    created.roles.push(role!.id);
    await db.insert(s.userRoles).values({ userId: u.id, roleId: role!.id });
    return { user: sessionUser(u), roleKeys: [role!.key], permissions: new Set(permissions), isSuperAdmin: false };
  }

  async function makeOrg<T extends "employer" | "recruitment_partner" | "institution">(type: T, permissions: string[]): Promise<OrgContext<T>> {
    const [org] = await db.insert(s.organizations).values({ type, name: `Org ${randomUUID().slice(0, 6)}`, slug: `org-${randomUUID()}`, status: "verified" }).returning();
    created.orgs.push(org!.id);
    const [role] = await db.insert(s.roles).values({ scope: type, key: `ops-${randomUUID().slice(0, 12)}`, name: "Member", permissions }).returning();
    created.roles.push(role!.id);
    const u = await makeUser();
    const [member] = await db.insert(s.organizationMembers).values({ organizationId: org!.id, userId: u.id, roleId: role!.id }).returning();
    return {
      orgType: type,
      user: sessionUser(u),
      sessionId: "test-session",
      organization: org!,
      membership: { id: member!.id, status: "active", jobTitle: null, department: null },
      role: { id: role!.id, key: role!.key, name: role!.name },
      permissions: new Set(permissions),
      isOwner: false,
    };
  }

  /** Background tasks enqueued during this test run for an event (optionally matching a data field). */
  async function enqueued(type: string, event: string, match?: { path: string; value: string }) {
    const rows = await db
      .select()
      .from(s.backgroundJobs)
      .where(and(eq(s.backgroundJobs.type, type), gte(s.backgroundJobs.createdAt, startedAt), sql`${s.backgroundJobs.payload}->>'event' = ${event}`));
    if (!match) return rows;
    return rows.filter((r) => {
      const data = (r.payload as { data?: Record<string, unknown> }).data ?? {};
      return String(data[match.path]) === match.value;
    });
  }

  async function expectActionError(promise: Promise<unknown>, pattern?: RegExp): Promise<InstanceType<typeof ActionError>> {
    const error = await promise.then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(ActionError);
    if (pattern) expect((error as Error).message).toMatch(pattern);
    return error as InstanceType<typeof ActionError>;
  }

  const enquiryInput = (over: Record<string, unknown> = {}) => ({
    type: "general" as const,
    name: "Enquiry sender",
    email: `sender-${randomUUID()}@vsg-test.invalid`,
    phone: undefined,
    organizationName: undefined,
    subject: "Question about services",
    message: "Please tell me more about your services.",
    consentToContact: true,
    website: undefined,
    sourcePage: "/contact",
    locale: "en",
    utm: undefined,
    ...over,
  });

  afterAll(async () => {
    const ids = created.users;
    if (ids.length) {
      await db.execute(sql`delete from message_threads where created_by_user_id in ${sql.raw(`(${ids.map((i) => `'${i}'`).join(",")})`)}`);
      await db.delete(s.tasks).where(inArray(s.tasks.createdByUserId, ids));
      await db.delete(s.internalNotes).where(inArray(s.internalNotes.authorUserId, ids));
      await db.delete(s.fileAccessGrants).where(inArray(s.fileAccessGrants.granteeUserId, ids));
      await db.delete(s.files).where(inArray(s.files.ownerUserId, ids));
      await db.delete(s.organizationMembers).where(inArray(s.organizationMembers.userId, ids));
      await db.delete(s.userRoles).where(inArray(s.userRoles.userId, ids));
    }
    await pool.end();
  });

  // -------------------------------------------------------------------------
  describe("public enquiries", () => {
    it("drops honeypot submissions silently and records a security event", async () => {
      const input = enquiryInput({ website: "https://spam.example" });
      const result = await enquiriesSvc.submitPublicEnquiry(input, { ipHash: `ip-${run}-hp` });
      expect(result).toEqual({ accepted: true, code: null });
      expect(await db.select().from(s.enquiries).where(eq(s.enquiries.email, input.email))).toHaveLength(0);
      const events = await db.select().from(s.securityEvents).where(and(eq(s.securityEvents.type, "form_honeypot_triggered"), gte(s.securityEvents.occurredAt, startedAt)));
      expect(events.length).toBeGreaterThan(0);
    });

    it("rate limits by IP hash and by email address", async () => {
      const ipHash = `ip-${run}-rl`;
      for (let i = 0; i < 5; i++) await enquiriesSvc.submitPublicEnquiry(enquiryInput(), { ipHash });
      const error = await expectActionError(enquiriesSvc.submitPublicEnquiry(enquiryInput(), { ipHash }), /several enquiries/);
      expect(error.code).toBe("rate_limited");

      const email = `repeat-${run}@vsg-test.invalid`;
      for (let i = 0; i < 5; i++) await enquiriesSvc.submitPublicEnquiry(enquiryInput({ email }), { ipHash: `ip-${run}-e${i}` });
      await expectActionError(enquiriesSvc.submitPublicEnquiry(enquiryInput({ email }), { ipHash: `ip-${run}-e9` }), /several enquiries/);
    });

    it("requires consent and a contact route", async () => {
      await expectActionError(enquiriesSvc.submitPublicEnquiry(enquiryInput({ consentToContact: false }), { ipHash: `ip-${run}-c1` }), /agree/);
      await expectActionError(enquiriesSvc.submitPublicEnquiry(enquiryInput({ email: undefined }), { ipHash: `ip-${run}-c2` }), /email address or a phone/);
    });

    it("creates or attaches a lead for business enquiries and notifies staff and the sender", async () => {
      const email = `employer-${run}@vsg-test.invalid`;
      const first = await enquiriesSvc.submitPublicEnquiry(enquiryInput({ type: "employer", email, organizationName: "Sample builder" }), { ipHash: `ip-${run}-l1` });
      const second = await enquiriesSvc.submitPublicEnquiry(enquiryInput({ type: "employer", email }), { ipHash: `ip-${run}-l2` });
      const partner = await enquiriesSvc.submitPublicEnquiry(enquiryInput({ type: "partner", email }), { ipHash: `ip-${run}-l3` });
      const rows = await db.select().from(s.enquiries).where(eq(s.enquiries.email, email));
      const byCode = new Map(rows.map((r) => [r.code, r]));
      const leadA = byCode.get(first.code!)!.leadId;
      expect(leadA).toBeTruthy();
      expect(byCode.get(second.code!)!.leadId).toBe(leadA);
      expect(byCode.get(partner.code!)!.leadId).not.toBe(leadA);
      const [lead] = await db.select().from(s.leads).where(eq(s.leads.id, leadA!));
      expect(lead).toMatchObject({ type: "employer", source: "website_form", organizationName: "Sample builder", consentToContact: true, status: "new" });

      const staffJobs = await enqueued("notifications.dispatch_staff", "enquiry.received", { path: "code", value: first.code! });
      expect(staffJobs).toHaveLength(1);
      expect(staffJobs[0]!.payload).toMatchObject({ permission: "leads.view" });
      // The business inbox copy (notifications.business_inbox_email) is a second dispatch with forStaff: true.
      const ack = (await enqueued("notifications.dispatch", "enquiry.received", { path: "code", value: first.code! })).filter((j) => JSON.stringify(j.payload).includes(email));
      expect(ack[0]!.payload).toMatchObject({ recipients: [{ email }], channels: ["email"], data: { forStaff: false } });
    });

    it("turns grievance enquiries into grievance tickets for grievance officers", async () => {
      const result = await enquiriesSvc.submitPublicEnquiry(enquiryInput({ type: "grievance", subject: "Complaint about an agent" }), { ipHash: `ip-${run}-g` });
      const [enquiry] = await db.select().from(s.enquiries).where(eq(s.enquiries.code, result.code!));
      expect(enquiry!.supportTicketId).toBeTruthy();
      const [ticket] = await db.select().from(s.supportTickets).where(eq(s.supportTickets.id, enquiry!.supportTicketId!));
      expect(ticket).toMatchObject({ isGrievance: true, category: "grievance", grievanceType: "general", priority: "high" });
      expect(ticket!.grievanceCode).toMatch(/^VSG-GRV-/);
      expect(ticket!.resolutionDueAt).not.toBeNull();
      const staffJobs = await enqueued("notifications.dispatch_staff", "enquiry.received", { path: "code", value: result.code! });
      expect(staffJobs[0]!.payload).toMatchObject({ permission: "support.grievances" });
    });
  });

  // -------------------------------------------------------------------------
  describe("workforce requirements", () => {
    const lines = [
      { roleTitle: "TIG welder", positions: 12, requiredSkills: ["GTAW"], salaryMin: 1800, salaryMax: 2400, salaryCurrency: "AED", salaryPeriod: "month" as const },
      { roleTitle: "Pipe fitter", positions: 8, requiredSkills: [] },
    ];
    const work = {
      kind: "bulk" as const,
      title: "Welders for a refinery shutdown",
      assessmentRequired: true,
      benefits: ["visa", "air_ticket"],
      accommodationProvided: true,
      foodProvided: false,
      transportProvided: true,
      urgency: "high" as const,
      lines,
    };

    it("stores public submissions with a lead, lines and an approval request, and handles review decisions", async () => {
      const contactEmail = `req-${run}@vsg-test.invalid`;
      const result = await requirementsSvc.submitPublicRequirement(
        { ...work, organizationName: "Sample contractor", contactName: "Contact person", contactEmail, consentToContact: true, website: undefined, sourcePage: "/employers/request", locale: "en", utm: undefined } as never,
        { ipHash: `ip-${run}-req` },
      );
      expect(result.code).toMatch(/^VSG-REQ-/);
      const [req] = await db.select().from(s.requirementRequests).where(eq(s.requirementRequests.code, result.code!));
      expect(req).toMatchObject({ status: "submitted", source: "public_form", organizationId: null, totalPositions: 20, consentToContact: true });
      expect(req!.leadId).toBeTruthy();
      expect(req!.approvalRequestId).toBeTruthy();
      const lineRows = await db.select().from(s.requirementLines).where(eq(s.requirementLines.requirementId, req!.id));
      expect(lineRows.find((l) => l.roleTitle === "TIG welder")).toMatchObject({ salaryMinMinor: 180_000, salaryMaxMinor: 240_000, salaryCurrency: "AED" });
      expect(await enqueued("notifications.dispatch_staff", "requirement.received", { path: "code", value: result.code! })).toHaveLength(1);
      const dispatches = await enqueued("notifications.dispatch", "requirement.received", { path: "code", value: result.code! });
      expect(dispatches.find((j) => JSON.stringify(j.payload).includes(contactEmail))!.payload).toMatchObject({ recipients: [{ email: contactEmail }] });
      expect(dispatches.some((j) => JSON.stringify(j.payload).includes("vsweld@gmail.com"))).toBe(true);

      const approver = await makeStaff(["approvals.decide", "approvals.view", "requirements.manage", "requirements.view"]);
      await approvals.decideApproval({ requestId: req!.approvalRequestId!, decision: "changes_requested", reason: "Please confirm the joining date.", ctx: approver });
      let [after] = await db.select().from(s.requirementRequests).where(eq(s.requirementRequests.id, req!.id));
      expect(after).toMatchObject({ status: "on_hold", statusReason: "Please confirm the joining date." });
      const statusJobs = await enqueued("notifications.dispatch", "requirement.status_changed", { path: "code", value: result.code! });
      expect(statusJobs[0]!.payload).toMatchObject({ recipients: [{ email: contactEmail }], data: { status: "Changes requested" } });

      await expectActionError(requirementsSvc.changeRequirementStatus(approver, req!.id, "sourcing"), /not been approved/);
      await requirementsSvc.changeRequirementStatus(approver, req!.id, "under_review");
      const [reopened] = await db.select().from(s.approvalRequests).where(eq(s.approvalRequests.id, req!.approvalRequestId!));
      expect(reopened!.status).toBe("pending");
      await approvals.decideApproval({ requestId: req!.approvalRequestId!, decision: "approved", ctx: approver });
      [after] = await db.select().from(s.requirementRequests).where(eq(s.requirementRequests.id, req!.id));
      expect(after!.status).toBe("approved");
      expect(after!.approvedAt).not.toBeNull();
      await requirementsSvc.changeRequirementStatus(approver, req!.id, "sourcing");
      await expectActionError(requirementsSvc.changeRequirementStatus(approver, req!.id, "closed"), /cannot move/);
      await expectActionError(requirementsSvc.changeRequirementStatus(approver, req!.id, "on_hold"), /reason/);
    });

    it("lets employers submit, edit after a change request and see only their own requirements without internal notes", async () => {
      const employer = await makeOrg("employer", ["employer.requirements.manage", "employer.dashboard"]);
      const other = await makeOrg("employer", ["employer.requirements.manage"]);
      const created1 = await requirementsSvc.submitEmployerRequirement(employer, { ...work, attachmentFileIds: [], asDraft: false } as never);
      expect(created1.status).toBe("submitted");
      const staff = await makeStaff(["approvals.decide", "requirements.manage", "requirements.view"]);
      await requirementsSvc.setRequirementInternalNotes(staff, created1.id, "Internal margin discussion");

      const view = await requirementQueries.getOrgRequirement(employer, created1.id);
      expect(view).not.toBeNull();
      expect(view).not.toHaveProperty("internalNotes");
      expect(view).not.toHaveProperty("ipHash");
      expect(view!.lines).toHaveLength(2);
      expect(await requirementQueries.getOrgRequirement(other, created1.id)).toBeNull();
      expect((await requirementQueries.listOrgRequirements(other, {}, { page: 1, pageSize: 20, offset: 0 })).total).toBe(0);
      const staffView = await requirementQueries.getRequirement(staff, created1.id);
      expect(staffView!.requirement.internalNotes).toBe("Internal margin discussion");

      const [req] = await db.select().from(s.requirementRequests).where(eq(s.requirementRequests.id, created1.id));
      await approvals.decideApproval({ requestId: req!.approvalRequestId!, decision: "changes_requested", reason: "Add salary for the pipe fitters.", ctx: staff });
      expect((await db.select().from(s.requirementRequests).where(eq(s.requirementRequests.id, created1.id)))[0]!.status).toBe("draft");
      expect(await enqueued("notifications.dispatch_org", "requirement.status_changed", { path: "code", value: req!.code })).toHaveLength(1);

      await expectActionError(requirementsSvc.updateEmployerRequirement(other, created1.id, { ...work, attachmentFileIds: [], asDraft: false } as never), /not found/);
      const updated = await requirementsSvc.updateEmployerRequirement(employer, created1.id, {
        ...work,
        lines: [lines[0]!, { roleTitle: "Pipe fitter", positions: 8, requiredSkills: [], salaryMin: 1500, salaryCurrency: "AED", salaryPeriod: "month" }],
        attachmentFileIds: [],
        asDraft: false,
      } as never);
      expect(updated.status).toBe("submitted");
      const [approval] = await db.select().from(s.approvalRequests).where(eq(s.approvalRequests.id, req!.approvalRequestId!));
      expect(approval!.status).toBe("pending");

      await requirementsSvc.cancelEmployerRequirement(employer, created1.id, "Project postponed");
      const [cancelled] = await db.select().from(s.requirementRequests).where(eq(s.requirementRequests.id, created1.id));
      expect(cancelled).toMatchObject({ status: "cancelled", statusReason: "Project postponed" });
      expect((await db.select().from(s.approvalRequests).where(eq(s.approvalRequests.id, req!.approvalRequestId!)))[0]!.status).toBe("cancelled");
    });
  });

  // -------------------------------------------------------------------------
  describe("support tickets", () => {
    it("keeps internal notes away from requesters and drives the status machine", async () => {
      const requesterRow = await makeUser({ name: "Requester" });
      const requester = sessionUser(requesterRow);
      const agent = await makeStaff(["support.view", "support.manage"], "Support agent");
      const ticket = await supportSvc.createSupportTicket(
        { kind: "user", user: requester, portal: "talent" },
        { category: "account_issue", priority: "normal", subject: "Cannot verify my phone", message: "The code never arrives on my phone.", attachmentFileIds: [], portal: "talent" },
      );
      const [row] = await db.select().from(s.supportTickets).where(eq(s.supportTickets.id, ticket.id!));
      expect(row!.firstResponseDueAt!.getTime() - row!.createdAt.getTime()).toBe(24 * 3_600_000);
      expect(row!.resolutionDueAt).toBeNull();
      expect(await enqueued("notifications.dispatch", "support.ticket_created", { path: "code", value: ticket.code! })).toHaveLength(1);
      expect(await enqueued("notifications.dispatch_staff", "support.ticket_created", { path: "code", value: ticket.code! })).toHaveLength(1);

      await supportSvc.replyToTicket(agent, ticket.id!, { body: "Checked the SMS provider logs.", internal: true });
      await supportSvc.replyToTicket(agent, ticket.id!, { body: "We have resent the code. Please try again." });
      const mine = await supportQueries.getMyTicket(requester, ticket.id!);
      expect(mine!.messages.map((m) => m.body)).toEqual(["The code never arrives on my phone.", "We have resent the code. Please try again."]);
      expect(mine!.messages[1]!.authorLabel).toBe("Venkat Sai support");
      expect(mine!.status).toBe("pending_requester");
      const staffView = await supportQueries.getTicket(agent, ticket.id!);
      expect(staffView!.messages.filter((m) => m.isInternal).map((m) => m.body)).toEqual(["Checked the SMS provider logs."]);
      expect(staffView!.ticket.firstRespondedAt).not.toBeNull();
      expect(staffView!.ticket.assignedToUserId).toBe(agent.user.id);

      const stranger = sessionUser(await makeUser());
      expect(await supportQueries.getMyTicket(stranger, ticket.id!)).toBeNull();
      await expectActionError(supportSvc.replyToOwnTicket(stranger, ticket.id!, { body: "hi" }), /not found/);

      await supportSvc.replyToOwnTicket(requester, ticket.id!, { body: "Still not working." });
      expect((await supportQueries.getMyTicket(requester, ticket.id!))!.status).toBe("pending_staff");
      await expectActionError(supportSvc.rateOwnTicket(requester, ticket.id!, { rating: 5 }), /resolved/);
      await expectActionError(supportSvc.changeTicketStatus(agent, ticket.id!, "resolved"), /resolution/);
      await supportSvc.changeTicketStatus(agent, ticket.id!, "resolved", { resolution: "The phone number had a typo; corrected." });
      expect(await enqueued("notifications.dispatch", "support.ticket_resolved", { path: "code", value: ticket.code! })).toHaveLength(1);
      await supportSvc.rateOwnTicket(requester, ticket.id!, { rating: 5, comment: "Quick help" });
      expect((await db.select().from(s.supportTickets).where(eq(s.supportTickets.id, ticket.id!)))[0]).toMatchObject({ status: "resolved", satisfactionRating: 5 });
    });

    it("shares staff attachments with the requester's account", async () => {
      const requester = sessionUser(await makeUser());
      const agent = await makeStaff(["support.view", "support.manage"]);
      const ticket = await supportSvc.createSupportTicket(
        { kind: "user", user: requester, portal: "talent" },
        { category: "documentation_issue", priority: "low", subject: "Document format", message: "Which document format do you accept?", attachmentFileIds: [], portal: "talent" },
      );
      const [file] = await db
        .insert(s.files)
        .values({ storageDriver: "local", storageKey: `test/${randomUUID()}`, originalName: "guide.pdf", mimeType: "application/pdf", sizeBytes: 10, sha256: "0".repeat(64), purpose: "ticket_attachment", ownerUserId: agent.user.id, scanStatus: "clean" })
        .returning();
      await supportSvc.replyToTicket(agent, ticket.id!, { body: "See the attached guide.", attachmentFileIds: [file!.id] });
      const grants = await db.select().from(s.fileAccessGrants).where(and(eq(s.fileAccessGrants.fileId, file!.id), eq(s.fileAccessGrants.granteeUserId, requester.id)));
      expect(grants).toHaveLength(1);
      expect((await supportQueries.getMyTicket(requester, ticket.id!))!.messages[1]!.attachments.map((a) => a.id)).toEqual([file!.id]);
    });

    it("accepts guest requests, drops honeypot hits and respects grievance permissions", async () => {
      const guest = { kind: "guest" as const, name: "Guest person", email: `guest-${run}@vsg-test.invalid`, ipHash: `ip-${run}-guest` };
      expect(
        await supportSvc.createSupportTicket(guest, { name: guest.name, email: guest.email, category: "other", subject: "Hello", message: "A question from a guest.", consentToContact: true, website: "x" } as never),
      ).toEqual({ id: null, code: null, grievanceCode: null });
      const ok = await supportSvc.createSupportTicket(guest, { name: guest.name, email: guest.email, category: "grievance", subject: "Formal complaint", message: "I want to raise a grievance.", consentToContact: true } as never);
      expect(ok.grievanceCode).toMatch(/^VSG-GRV-/);
      const agent = await makeStaff(["support.view", "support.manage"]);
      expect(await supportQueries.getTicket(agent, ok.id!)).toBeNull();
      await expectActionError(supportSvc.replyToTicket(agent, ok.id!, { body: "Hello" }), /permission/);
      const officer = await makeStaff(["support.view", "support.manage", "support.grievances"]);
      expect(await supportQueries.getTicket(officer, ok.id!)).not.toBeNull();
      await expectActionError(supportSvc.replyToTicket(officer, ok.id!, { body: "See attachment", attachmentFileIds: [randomUUID()] }), /could not be found|cannot open/);
    });

    it("flags SLA breaches once, escalates grievances and notifies without repeating", async () => {
      const officer = await makeStaff(["support.view", "support.manage", "support.grievances"]);
      const sla = { firstResponseHours: { urgent: 4, high: 8, normal: 24, low: 72 }, grievanceAckHours: 24, grievanceResolutionDays: 15 };
      const old = new Date(Date.now() - 20 * 86_400_000);
      const ticket = await db.transaction((tx) =>
        supportSvc.insertTicket(
          tx,
          {
            requesterName: "Old grievance",
            requesterEmail: `old-${run}@vsg-test.invalid`,
            portal: "public",
            channel: "web",
            category: "grievance",
            priority: "normal",
            subject: `Overdue grievance ${run}`,
            message: "Nobody answered.",
            firstMessageBy: { type: "requester", userId: null, name: "Old grievance" },
            assignedToUserId: officer.user.id,
            createdAt: old,
          },
          sla,
        ),
      );
      const first = await supportSvc.runSlaWatch(new Date());
      expect(first.breached).toBeGreaterThanOrEqual(1);
      const [after] = await db.select().from(s.supportTickets).where(eq(s.supportTickets.id, ticket.id));
      expect(after!.slaBreachedAt).not.toBeNull();
      expect(after).toMatchObject({ escalationLevel: 2, priority: "urgent" });
      const jobs = await enqueued("notifications.dispatch", "support.sla_breached", { path: "code", value: ticket.code });
      expect(jobs.length).toBe(2);
      const officerJobs = await enqueued("notifications.dispatch_staff", "support.sla_breached", { path: "code", value: ticket.code });
      expect(officerJobs.length).toBe(2);

      await supportSvc.runSlaWatch(new Date());
      expect((await enqueued("notifications.dispatch", "support.sla_breached", { path: "code", value: ticket.code })).length).toBe(2);
      const [again] = await db.select().from(s.supportTickets).where(eq(s.supportTickets.id, ticket.id));
      expect(again!.slaBreachedAt!.getTime()).toBe(after!.slaBreachedAt!.getTime());
    });
  });

  // -------------------------------------------------------------------------
  describe("message threads", () => {
    it("enforces participation and organisation boundaries and tracks unread messages", async () => {
      const staff = await makeStaff(["requirements.view", "requirements.manage"]);
      const employerA = await makeOrg("employer", ["employer.requirements.manage"]);
      const employerB = await makeOrg("employer", ["employer.requirements.manage"]);
      const req = await requirementsSvc.submitEmployerRequirement(employerA, {
        kind: "individual",
        title: "Site engineer",
        assessmentRequired: false,
        benefits: [],
        accommodationProvided: false,
        foodProvided: false,
        transportProvided: false,
        urgency: "normal",
        lines: [{ roleTitle: "Site engineer", positions: 1, requiredSkills: [] }],
        attachmentFileIds: [],
        asDraft: true,
      } as never);

      const staffActor = { kind: "staff" as const, ctx: staff };
      const memberA = { kind: "org" as const, ctx: employerA };
      const memberB = { kind: "org" as const, ctx: employerB };
      await expectActionError(
        threadsSvc.createThread(staffActor, { portal: "admin", subject: "Wrong org", contextType: "requirement", contextId: req.id, organizationId: employerB.organization.id, participantUserIds: [], message: "Hi", attachmentFileIds: [] }),
        /not part of the selected record/,
      );
      const thread = await threadsSvc.createThread(staffActor, {
        portal: "admin",
        subject: "Questions about the site engineer role",
        contextType: "requirement",
        contextId: req.id,
        organizationId: employerA.organization.id,
        participantUserIds: [],
        message: "Could you share the shift pattern?",
        attachmentFileIds: [],
      });
      expect(await enqueued("notifications.dispatch_org", "message.received", { path: "subject", value: "Questions about the site engineer role" })).toHaveLength(1);

      const listA = await threadQueries.listThreads(memberA, {}, { page: 1, pageSize: 20, offset: 0 });
      expect(listA.items.map((t) => t.id)).toContain(thread.id);
      expect(listA.items.find((t) => t.id === thread.id)!.unreadCount).toBe(1);
      expect((await threadQueries.listThreads(memberB, {}, { page: 1, pageSize: 20, offset: 0 })).items.map((t) => t.id)).not.toContain(thread.id);
      expect(await threadQueries.getThread(memberB, thread.id)).toBeNull();
      await expectActionError(threadsSvc.postThreadMessage(memberB, thread.id, { body: "Let me in" }), /not found/);

      await threadsSvc.markThreadRead(memberA, thread.id);
      expect((await threadQueries.listThreads(memberA, {}, { page: 1, pageSize: 20, offset: 0 })).items.find((t) => t.id === thread.id)!.unreadCount).toBe(0);
      await threadsSvc.postThreadMessage(memberA, thread.id, { body: "Two shifts, 10 hours each." });
      const staffView = await threadQueries.getThread(staffActor, thread.id);
      expect(staffView!.messages.map((m) => m.body)).toEqual(["Could you share the shift pattern?", "Two shifts, 10 hours each."]);
      expect(await threadQueries.unreadThreadCount(staffActor)).toBeGreaterThanOrEqual(1);
      expect(await enqueued("notifications.dispatch", "message.received", { path: "excerpt", value: "Two shifts, 10 hours each." })).toHaveLength(1);

      await threadsSvc.setThreadStatus(memberA, thread.id, "closed");
      await expectActionError(threadsSvc.postThreadMessage(memberA, thread.id, { body: "One more" }), /closed/);
      await expectActionError(threadsSvc.setThreadStatus(memberA, thread.id, "open"), /Only Venkat Sai staff/);
      await threadsSvc.setThreadStatus(staffActor, thread.id, "open");
    });

    it("limits candidate conversations to active participants", async () => {
      const staff = await makeStaff(["orgs.view"]);
      const candidate = sessionUser(await makeUser({ name: "Candidate" }));
      const outsider = sessionUser(await makeUser({ name: "Outsider" }));
      const thread = await threadsSvc.createThread(
        { kind: "staff", ctx: staff },
        { portal: "admin", subject: "Your documents", contextType: "general", participantUserIds: [candidate.id], message: "Please upload your passport copy.", attachmentFileIds: [] },
      );
      const candidateActor = { kind: "user" as const, user: candidate };
      expect(await threadQueries.getThread(candidateActor, thread.id)).not.toBeNull();
      await threadsSvc.postThreadMessage(candidateActor, thread.id, { body: "Uploaded today." });
      expect(await threadQueries.getThread({ kind: "user", user: outsider }, thread.id)).toBeNull();
      await expectActionError(threadsSvc.createThread(candidateActor, { portal: "talent", subject: "x", contextType: "general", participantUserIds: [], message: "x", attachmentFileIds: [] }), /support request/);

      await threadsSvc.removeThreadParticipant(staff, thread.id, candidate.id);
      expect(await threadQueries.getThread(candidateActor, thread.id)).toBeNull();
    });

    it("hides partner threads from partner members without partner.messages", async () => {
      const staff = await makeStaff(["orgs.view"]);
      const partnerWith = await makeOrg("recruitment_partner", ["partner.messages"]);
      const thread = await threadsSvc.createThread(
        { kind: "staff", ctx: staff },
        { portal: "admin", subject: "Agreement renewal", contextType: "organization", contextId: partnerWith.organization.id, participantUserIds: [], message: "Your agreement is due for renewal.", attachmentFileIds: [] },
      );
      expect(await threadQueries.getThread({ kind: "org", ctx: partnerWith }, thread.id)).not.toBeNull();
      const withoutPermission = { ...partnerWith, permissions: new Set<string>(["partner.dashboard"]) };
      expect(await threadQueries.getThread({ kind: "org", ctx: withoutPermission }, thread.id)).toBeNull();
      expect((await threadQueries.listThreads({ kind: "org", ctx: withoutPermission }, {}, { page: 1, pageSize: 20, offset: 0 })).total).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  describe("internal notes, leads and tasks", () => {
    it("separates staff notes from organisation-internal notes", async () => {
      const staff = await makeStaff(["requirements.view"]);
      const employer = await makeOrg("employer", ["employer.requirements.manage"]);
      const otherEmployer = await makeOrg("employer", ["employer.requirements.manage"]);
      const req = await requirementsSvc.submitEmployerRequirement(employer, {
        kind: "individual",
        title: "Quality inspector",
        assessmentRequired: false,
        benefits: [],
        accommodationProvided: false,
        foodProvided: false,
        transportProvided: false,
        urgency: "low",
        lines: [{ roleTitle: "Quality inspector", positions: 2, requiredSkills: [] }],
        attachmentFileIds: [],
        asDraft: true,
      } as never);
      await workSvc.addInternalNote({ kind: "staff", ctx: staff }, { entityType: "requirement", entityId: req.id, body: "Staff-only remark", visibility: "staff", pinned: false });
      await workSvc.addInternalNote({ kind: "org", ctx: employer }, { entityType: "requirement", entityId: req.id, body: "Our own reminder", visibility: "staff", pinned: true });
      const orgNotes = await workSvc.listInternalNotes({ kind: "org", ctx: employer }, "requirement", req.id);
      expect(orgNotes.map((n) => [n.body, n.visibility])).toEqual([["Our own reminder", "org_internal"]]);
      const staffNotes = await workSvc.listInternalNotes({ kind: "staff", ctx: staff }, "requirement", req.id);
      expect(staffNotes.map((n) => n.body).sort()).toEqual(["Our own reminder", "Staff-only remark"]);
      await expectActionError(workSvc.listInternalNotes({ kind: "org", ctx: otherEmployer }, "requirement", req.id), /not found/);
      await expectActionError(workSvc.addInternalNote({ kind: "org", ctx: otherEmployer }, { entityType: "requirement", entityId: req.id, body: "x", visibility: "org_internal", pinned: false }), /not found/);
    });

    it("runs the lead pipeline with assignment checks, follow-ups and conversion", async () => {
      const manager = await makeStaff(["leads.view", "leads.manage", "orgs.view"]);
      const noLeads = await makeStaff(["jobs.view"]);
      const seller = await makeStaff(["leads.view"]);
      const lead = await leadsSvc.createLead(manager, {
        type: "employer",
        source: "event",
        name: "Event contact",
        organizationName: "Sample shipyard",
        consentToContact: true,
        email: `lead-${run}@vsg-test.invalid`,
      } as never);
      await expectActionError(leadsSvc.assignLead(manager, lead.id, noLeads.user.id), /eligible|allowed/);
      await leadsSvc.assignLead(manager, lead.id, seller.user.id);
      expect(await enqueued("notifications.dispatch", "work.assigned", { path: "code", value: lead.code })).toHaveLength(1);
      await expectActionError(leadsSvc.changeLeadStatus(manager, lead.id, "won"), /cannot move/);
      await expectActionError(leadsSvc.changeLeadStatus(manager, lead.id, "lost"), /why/);
      await leadsSvc.recordLeadFollowUp(manager, lead.id, { note: "Called, interested in 30 welders.", nextFollowUpAt: new Date(Date.now() + 86_400_000) });
      const [afterCall] = await db.select().from(s.leads).where(eq(s.leads.id, lead.id));
      expect(afterCall!.status).toBe("contacted");
      expect(afterCall!.lastContactedAt).not.toBeNull();
      const institution = await makeOrg("institution", ["institution.dashboard"]);
      await expectActionError(leadsSvc.convertLead(manager, lead.id, institution.organization.id), /different kind/);
      const employer = await makeOrg("employer", ["employer.dashboard"]);
      await leadsSvc.convertLead(manager, lead.id, employer.organization.id);
      expect((await db.select().from(s.leads).where(eq(s.leads.id, lead.id)))[0]).toMatchObject({ status: "won", organizationId: employer.organization.id });
    });

    it("sends each task reminder once", async () => {
      const lead = await makeStaff(["leads.view"]);
      const assignee = await makeStaff(["support.view"]);
      const task = await workSvc.createStaffTask(lead, { title: `Call back the employer ${run}`, priority: "high", dueAt: new Date(Date.now() + 30 * 60_000), assignedToUserId: assignee.user.id } as never);
      await expectActionError(workSvc.setStaffTaskStatus(await makeStaff([]), task.id, "done"), /Only the person/);
      await workSvc.runOperationsReminders(new Date());
      await workSvc.runOperationsReminders(new Date());
      const reminders = await enqueued("notifications.dispatch", "work.reminder", { path: "title", value: `Call back the employer ${run}` });
      expect(reminders).toHaveLength(1);
      await workSvc.completeStaffTask(assignee, task.id);
      expect((await db.select().from(s.tasks).where(eq(s.tasks.id, task.id)))[0]).toMatchObject({ status: "done", completedByUserId: assignee.user.id });
    });
  });
});
