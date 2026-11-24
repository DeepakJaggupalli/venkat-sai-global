/**
 * Integration tests for trade test and training seat bookings against an ISOLATED database:
 *   node scripts/test-db.mjs vsg_t_bookings
 *   DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5433/vsg_t_bookings npx vitest run src/modules/bookings --no-file-parallelism
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const enabled = /\/vsg_(?:t|test|r)_[a-z0-9_]+(\?|$)/.test(process.env.DATABASE_URL ?? "");

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, getAll: () => [], has: () => false, set: () => undefined, delete: () => undefined }),
  headers: async () => new Headers({ host: "localhost:3000" }),
}));

describe.skipIf(!enabled)("trade test and training bookings (PostgreSQL)", async () => {
  if (!enabled) {
    it("needs DATABASE_URL pointing to a vsg_t_* database", () => undefined);
    return;
  }

  const { and, eq, gte, sql } = await import("drizzle-orm");
  const { db, pool } = await import("@/db");
  const s = await import("@/db/schema");
  const { ActionError } = await import("@/lib/actions");
  const service = await import("./service");
  const queries = await import("./queries");
  const { venueNow } = await import("./rules");
  const { bookingRequestSchema, bookingSlotSchema, staffBookingSchema } = await import("./schemas");
  type StaffContext = import("@/modules/identity/authz").StaffContext;

  const startedAt = new Date(Date.now() - 1000);
  let staff: StaffContext;

  async function makeStaff(permissions: string[]): Promise<StaffContext> {
    const [u] = await db.insert(s.users).values({ displayName: "Bookings test", email: `b-${randomUUID()}@vsg-test.invalid`, emailVerifiedAt: new Date(), isStaff: true }).returning();
    const [role] = await db.insert(s.roles).values({ scope: "platform", key: `b-${randomUUID().slice(0, 12)}`, name: "Test role", permissions }).returning();
    await db.insert(s.userRoles).values({ userId: u!.id, roleId: role!.id });
    return {
      user: {
        id: u!.id,
        email: u!.email,
        phone: null,
        emailVerifiedAt: u!.emailVerifiedAt,
        phoneVerifiedAt: null,
        displayName: u!.displayName,
        avatarFileId: null,
        status: u!.status,
        isStaff: true,
        locale: "en",
        timezone: null,
        hasPassword: false,
        twoFactorEnabled: false,
      },
      roleKeys: [role!.key],
      permissions: new Set(permissions),
      isSuperAdmin: false,
    };
  }

  function phone(): string {
    return `+9197${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;
  }

  /** YYYY-MM-DD n days after today at the venue. */
  function dayAfter(n: number): string {
    return venueNow(new Date(Date.now() + n * 86_400_000)).date;
  }

  async function openSlot(overrides: Record<string, unknown> = {}) {
    const input = bookingSlotSchema.parse({ kind: "trade_test", title: "6G pipe welding test", trade: "Pipe welder 6G", date: dayAfter(3), startTime: "09:30", endTime: "13:00", capacity: "2", ...overrides });
    return service.createSlot(staff, input);
  }

  function request(slotCode: string, overrides: Record<string, unknown> = {}) {
    return bookingRequestSchema.parse({ slot: slotCode, name: "Ravi Kumar", phone: phone(), trade: "Pipe welder", consentToContact: "true", ...overrides });
  }

  async function slotRow(id: string) {
    const [row] = await db.select().from(s.bookingSlots).where(eq(s.bookingSlots.id, id)).limit(1);
    return row!;
  }

  async function bookingCount(slotId: string): Promise<number> {
    const [row] = await db.select({ value: sql<number>`count(*)::int` }).from(s.slotBookings).where(eq(s.slotBookings.slotId, slotId));
    return Number(row?.value ?? 0);
  }

  const meta = { ipHash: null };

  beforeAll(async () => {
    staff = await makeStaff(["recruitment.assessments", "candidates.view_contact"]);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("opens a slot with a code and the office address as the default place", async () => {
    const slot = await openSlot();
    expect(slot.code).toMatch(/^VSG-SLT-\d{6}$/);
    const row = await slotRow(slot.id);
    expect(row).toMatchObject({ status: "open", bookedSeats: 0, capacity: 2, startTime: "09:30", endTime: "13:00" });
    expect(row.venue).toContain("Autonagar");
    const listed = await queries.listPublicSlots({ kind: "trade_test" });
    expect(listed.find((p) => p.code === slot.code)).toMatchObject({ state: "open", seatsLeft: 2 });
    expect((await queries.listPublicSlots({ kind: "training" })).some((p) => p.code === slot.code)).toBe(false);
  });

  it("gives the last seat to exactly one of two people booking at the same moment", async () => {
    const slot = await openSlot({ capacity: "1" });
    const results = await Promise.allSettled([service.bookSlot(request(slot.code), meta), service.bookSlot(request(slot.code), meta)]);
    const won = results.filter((r) => r.status === "fulfilled");
    const lost = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(won).toHaveLength(1);
    expect(lost).toHaveLength(1);
    expect(lost[0]!.reason).toBeInstanceOf(ActionError);
    expect((lost[0]!.reason as InstanceType<typeof ActionError>).code).toBe("slot_full");
    expect((await slotRow(slot.id)).bookedSeats).toBe(1);
    expect(await bookingCount(slot.id)).toBe(1);
    const view = await queries.getPublicSlot(slot.code);
    expect(view).toMatchObject({ state: "full", seatsLeft: 0 });
    // Full dates stay on the public list, shown as "Full".
    expect((await queries.listPublicSlots({})).find((p) => p.code === slot.code)?.state).toBe("full");
  });

  it("returns the existing booking when the same phone books the same date again", async () => {
    const slot = await openSlot({ capacity: "5" });
    const number = phone();
    const first = await service.bookSlot(request(slot.code, { phone: number }), meta);
    expect(first.code).toMatch(/^VSG-BKG-\d{6}$/);
    expect(first.existing).toBe(false);
    expect(first.slot.seatsLeft).toBe(4);
    const again = await service.bookSlot(request(slot.code, { phone: number, forOrganization: "true", organizationName: "Sai Travels", seats: "3" }), meta);
    expect(again).toMatchObject({ code: first.code, existing: true, seats: 1 });
    // Both at once from a new number: one booking, the same code twice.
    const other = phone();
    const both = await Promise.all([service.bookSlot(request(slot.code, { phone: other }), meta), service.bookSlot(request(slot.code, { phone: other }), meta)]);
    expect(both[0].code).toBe(both[1].code);
    expect((await slotRow(slot.id)).bookedSeats).toBe(2);
    expect(await bookingCount(slot.id)).toBe(2);
  });

  it("gives the same person their booking back when they book the last seat twice at once", async () => {
    const slot = await openSlot({ capacity: "1" });
    const number = phone();
    const both = await Promise.allSettled([service.bookSlot(request(slot.code, { phone: number }), meta), service.bookSlot(request(slot.code, { phone: number }), meta)]);
    const codes = both.map((r) => (r.status === "fulfilled" ? r.value.code : `rejected: ${String((r.reason as { code?: string }).code)}`));
    expect(codes[0]).toMatch(/^VSG-BKG-/);
    expect(codes[1]).toBe(codes[0]);
    expect((await slotRow(slot.id)).bookedSeats).toBe(1);
    expect(await bookingCount(slot.id)).toBe(1);
  });

  it("never shows a booking to someone who only knows the mobile number", async () => {
    const slot = await openSlot({ capacity: "5" });
    const number = phone();
    const first = await service.bookSlot(request(slot.code, { phone: number, name: "Ravi Kumar", forOrganization: "true", organizationName: "Sai Travels", seats: "2" }), meta);
    const stranger = await service.bookSlot(request(slot.code, { phone: number, name: "Someone Else" }), meta);
    expect(stranger).toMatchObject({ existing: true, code: null, name: "Someone Else", organizationName: null, seats: 1 });
    expect(JSON.stringify(stranger)).not.toMatch(/Ravi|Sai Travels|VSG-BKG/);
    // The same person typing their name a little differently gets their booking back.
    const same = await service.bookSlot(request(slot.code, { phone: number, name: "  ravi   KUMAR. " }), meta);
    expect(same).toMatchObject({ existing: true, code: first.code, seats: 2, organizationName: "Sai Travels" });
    expect((await slotRow(slot.id)).bookedSeats).toBe(2);
    expect(await bookingCount(slot.id)).toBe(1);
  });

  it("marks attendance and cancels the date at the same moment without a deadlock", async () => {
    for (let i = 0; i < 6; i++) {
      const slot = await openSlot({ capacity: "3" });
      const booked = await service.bookSlot(request(slot.code), meta);
      const [row] = await db.select().from(s.slotBookings).where(eq(s.slotBookings.code, booked.code!)).limit(1);
      const results = await Promise.allSettled([service.setBookingStatus(staff, { id: row!.id, status: "attended" }), service.cancelSlot(staff, { id: slot.id, reason: "Examiner not available" })]);
      // Whichever goes second waits for the first; the only possible refusal is the plain "date was cancelled" message.
      for (const r of results) if (r.status === "rejected") expect(r.reason).toBeInstanceOf(ActionError);
      expect((await slotRow(slot.id)).status).toBe("cancelled");
    }
  });

  it("books several seats for a travel agency and refuses more than are left", async () => {
    const slot = await openSlot({ capacity: "5" });
    const agency = await service.bookSlot(request(slot.code, { forOrganization: "true", organizationName: "Sai Travels", seats: "4" }), meta);
    expect(agency).toMatchObject({ seats: 4, organizationName: "Sai Travels", existing: false });
    const tooMany = service.bookSlot(request(slot.code, { forOrganization: "true", organizationName: "Gulf Jobs", seats: "2" }), meta);
    await expect(tooMany).rejects.toMatchObject({ code: "slot_full", fieldErrors: { seats: [expect.stringContaining("Only 1 seat is left")] } });
    expect((await slotRow(slot.id)).bookedSeats).toBe(4);
  });

  it("stops one network filling a date with several mobile numbers", async () => {
    const slot = await openSlot({ capacity: "60" });
    const network = { ipHash: `ip-${randomUUID()}` };
    const first = await service.bookSlot(request(slot.code, { forOrganization: "true", organizationName: "Sai Travels", seats: "15" }), network);
    // Same connection, another number: only what is left of the network's share.
    const over = service.bookSlot(request(slot.code, { forOrganization: "true", organizationName: "Gulf Jobs", seats: "10" }), network);
    await expect(over).rejects.toMatchObject({ code: "network_limit", fieldErrors: { seats: [expect.stringContaining(`Only ${service.WEBSITE_SEATS_PER_NETWORK - 15} more seats`)] } });
    expect((await slotRow(slot.id)).bookedSeats).toBe(15);
    await service.bookSlot(request(slot.code, { forOrganization: "true", organizationName: "Gulf Jobs", seats: String(service.WEBSITE_SEATS_PER_NETWORK - 15) }), network);
    await expect(service.bookSlot(request(slot.code), network)).rejects.toMatchObject({ code: "network_limit" });
    expect((await slotRow(slot.id)).bookedSeats).toBe(service.WEBSITE_SEATS_PER_NETWORK);

    // Another network still books; a cancelled booking gives the network its share back; staff can always add more.
    await service.bookSlot(request(slot.code), { ipHash: `ip-${randomUUID()}` });
    const [row] = await db.select().from(s.slotBookings).where(eq(s.slotBookings.code, first.code!)).limit(1);
    await service.setBookingStatus(staff, { id: row!.id, status: "cancelled" });
    await expect(service.bookSlot(request(slot.code), network)).resolves.toMatchObject({ existing: false, seats: 1 });
    await service.createStaffBooking(staff, staffBookingSchema.parse({ slotId: slot.id, name: "Walk-in", phone: phone(), trade: "Fitter", seats: "20", consentToContact: "on" }));
    expect((await slotRow(slot.id)).bookedSeats).toBe(service.WEBSITE_SEATS_PER_NETWORK - 15 + 1 + 1 + 20);
  });

  it("gives seats back when a booking is cancelled, and takes them again when it is restored", async () => {
    const slot = await openSlot({ capacity: "2" });
    const agency = await service.bookSlot(request(slot.code, { forOrganization: "true", organizationName: "Sai Travels", seats: "2" }), meta);
    await expect(service.bookSlot(request(slot.code), meta)).rejects.toMatchObject({ code: "slot_full" });
    const [row] = await db.select().from(s.slotBookings).where(eq(s.slotBookings.code, agency.code!)).limit(1);

    await service.setBookingStatus(staff, { id: row!.id, status: "cancelled" });
    expect((await slotRow(slot.id)).bookedSeats).toBe(0);
    const walkIn = await service.bookSlot(request(slot.code), meta);
    expect(walkIn.existing).toBe(false);
    expect((await slotRow(slot.id)).bookedSeats).toBe(1);

    // Only one seat is free now: the two-seat booking cannot come back.
    await expect(service.setBookingStatus(staff, { id: row!.id, status: "booked" })).rejects.toThrow(/Not enough free seats/);
    const [walkInRow] = await db.select().from(s.slotBookings).where(eq(s.slotBookings.code, walkIn.code!)).limit(1);
    await service.setBookingStatus(staff, { id: walkInRow!.id, status: "attended" });
    expect((await slotRow(slot.id)).bookedSeats).toBe(1);
    await service.setBookingStatus(staff, { id: walkInRow!.id, status: "cancelled" });
    await service.setBookingStatus(staff, { id: row!.id, status: "booked" });
    expect((await slotRow(slot.id)).bookedSeats).toBe(2);
  });

  it("refuses bookings on closed and past dates", async () => {
    const slot = await openSlot();
    await service.setSlotOpen(staff, { id: slot.id, open: false });
    await expect(service.bookSlot(request(slot.code), meta)).rejects.toMatchObject({ code: "slot_closed" });
    expect((await queries.listPublicSlots({})).some((p) => p.code === slot.code)).toBe(false);
    await service.setSlotOpen(staff, { id: slot.id, open: true });
    const later = new Date(Date.parse(`${dayAfter(3)}T05:00:00Z`)); // 10:30 at the venue, after the 09:30 start
    await expect(service.bookSlot(request(slot.code), meta, later)).rejects.toMatchObject({ code: "slot_closed" });
    expect((await service.bookSlot(request(slot.code), meta)).existing).toBe(false);
  });

  it("cancels a slot with its bookings and lists the people to tell", async () => {
    const slot = await openSlot({ capacity: "6" });
    const a = await service.bookSlot(request(slot.code, { name: "Asha" }), meta);
    await service.bookSlot(request(slot.code, { name: "Bala", forOrganization: "true", organizationName: "Sai Travels", seats: "3" }), meta);
    const c = await service.bookSlot(request(slot.code, { name: "Chand" }), meta);
    const [cRow] = await db.select().from(s.slotBookings).where(eq(s.slotBookings.code, c.code!)).limit(1);
    await service.setBookingStatus(staff, { id: cRow!.id, status: "cancelled" });

    const result = await service.cancelSlot(staff, { id: slot.id, reason: "Examiner not available" });
    expect(result.toInform).toBe(2);
    const row = await slotRow(slot.id);
    expect(row).toMatchObject({ status: "cancelled", bookedSeats: 0, cancelReason: "Examiner not available" });
    const detail = await queries.getSlotForStaff(staff, slot.id);
    const toInform = detail!.bookings.filter((b) => b.cancelledWithSlot);
    expect(toInform.map((b) => b.name).sort()).toEqual(["Asha", "Bala"]);
    expect(toInform.every((b) => b.status === "cancelled" && b.phone)).toBe(true);
    expect((await service.cancelSlot(staff, { id: slot.id, reason: "Again" })).toInform).toBe(0);

    await expect(service.bookSlot(request(slot.code), meta)).rejects.toMatchObject({ code: "slot_closed" });
    const [aRow] = await db.select().from(s.slotBookings).where(eq(s.slotBookings.code, a.code!)).limit(1);
    await expect(service.setBookingStatus(staff, { id: aRow!.id, status: "booked" })).rejects.toThrow(/cancelled/);
    await expect(service.setSlotOpen(staff, { id: slot.id, open: true })).rejects.toThrow(/cancelled/);
    expect((await queries.getPublicSlot(slot.code))?.state).toBe("cancelled");
  });

  it("alerts staff and the business inbox about a new booking", async () => {
    const slot = await openSlot();
    const booked = await service.bookSlot(request(slot.code), meta);
    const jobs = await db
      .select({ payload: s.backgroundJobs.payload })
      .from(s.backgroundJobs)
      .where(and(gte(s.backgroundJobs.createdAt, startedAt), sql`${s.backgroundJobs.payload}->>'event' = 'booking.received'`));
    const mine = jobs.filter((j) => (j.payload as { data?: { code?: string } }).data?.code === booked.code);
    expect(mine.length).toBeGreaterThanOrEqual(1);
    const staffAlert = mine.find((j) => (j.payload as { permission?: string }).permission === "recruitment.assessments");
    expect(staffAlert).toBeTruthy();
    // The in-app alert never carries the phone number.
    expect((staffAlert!.payload as { data: Record<string, unknown> }).data.phone).toBeUndefined();
  });

  it("drops honeypot submissions without booking", async () => {
    const slot = await openSlot();
    const result = await service.bookSlot(request(slot.code, { website: "https://spam.example" }), meta);
    expect(result.code).toBeNull();
    expect(await bookingCount(slot.id)).toBe(0);
  });

  it("lets staff add a booking and blocks a second one for the same phone", async () => {
    const slot = await openSlot({ capacity: "3" });
    const number = phone();
    const staffInput = (overrides: Record<string, unknown>) => staffBookingSchema.parse({ slotId: slot.id, name: "Walk-in", phone: number, trade: "Fitter", seats: "1", consentToContact: "on", ...overrides });
    const added = await service.createStaffBooking(staff, staffInput({ seats: "2", notes: "Came to the office" }));
    expect(added.code).toMatch(/^VSG-BKG-/);
    await expect(service.createStaffBooking(staff, staffInput({}))).rejects.toMatchObject({ fieldErrors: { phone: [expect.stringContaining(added.code)] } });
    const detail = await queries.getSlotForStaff(staff, slot.id);
    expect(detail!.bookings[0]).toMatchObject({ source: "staff", seats: 2, notes: "Came to the office" });
    expect(detail!.seatsLeft).toBe(1);
  });

  it("validates slots: no past dates, seats not below what is booked, staff permission", async () => {
    const past = bookingSlotSchema.parse({ kind: "training", title: "Scaffolding", trade: "Scaffolder", date: dayAfter(-2), startTime: "09:00", capacity: "5" });
    await expect(service.createSlot(staff, past)).rejects.toMatchObject({ fieldErrors: { date: [expect.any(String)] } });

    const slot = await openSlot({ capacity: "3" });
    await service.bookSlot(request(slot.code, { forOrganization: "true", organizationName: "Sai Travels", seats: "2" }), meta);
    const edit = bookingSlotSchema.parse({ id: slot.id, kind: "trade_test", title: "6G pipe welding test", trade: "Pipe welder 6G", date: dayAfter(4), startTime: "10:00", capacity: "1" });
    await expect(service.updateSlot(staff, { ...edit, id: slot.id })).rejects.toMatchObject({ fieldErrors: { capacity: [expect.stringContaining("2 seats are already booked")] } });
    const moved = await service.updateSlot(staff, { ...edit, id: slot.id, capacity: 4 });
    expect(moved).toMatchObject({ scheduleChanged: true, activeBookings: 1 });
    expect(await slotRow(slot.id)).toMatchObject({ date: dayAfter(4), startTime: "10:00", capacity: 4, bookedSeats: 2 });

    const outsider = await makeStaff(["candidates.view"]);
    await expect(service.createSlot(outsider, past)).rejects.toMatchObject({ code: "forbidden" });
    await expect(queries.getSlotForStaff(outsider, slot.id)).rejects.toMatchObject({ code: "forbidden" });
    // A malformed id in the URL is "not found", not a database error.
    expect(await queries.getSlotForStaff(staff, "0000000000000000000000000000000000-0")).toBeNull();
  });

  it("masks phone numbers for staff without the contact permission", async () => {
    const slot = await openSlot();
    await service.bookSlot(request(slot.code), meta);
    const coordinator = await makeStaff(["recruitment.assessments"]);
    const detail = await queries.getSlotForStaff(coordinator, slot.id);
    expect(detail!.canContact).toBe(false);
    expect(detail!.bookings[0]!.phone).toBeNull();
    expect(detail!.bookings[0]!.phoneMasked).not.toMatch(/\d{6}/);
  });

  it("links training slots to a course for the course page", async () => {
    const [course] = await db
      .insert(s.courses)
      .values({ code: `VSG-CRS-T${randomUUID().slice(0, 6)}`, slug: `scaffolding-${randomUUID().slice(0, 6)}`, title: "Scaffolding basics", category: "safety", status: "published", publishedAt: new Date() })
      .returning();
    const slot = await openSlot({ kind: "training", title: "Scaffolding training", trade: "Scaffolder", courseId: course!.id, capacity: "10" });
    expect(await queries.countBookableSlotsForCourse(course!.id)).toBe(1);
    expect(await queries.findPublicCourse(course!.slug)).toMatchObject({ id: course!.id });
    const listed = await queries.listPublicSlots({ courseId: course!.id });
    expect(listed.map((p) => p.code)).toEqual([slot.code]);
    expect(listed[0]).toMatchObject({ courseTitle: "Scaffolding basics", courseSlug: course!.slug });
  });
});
