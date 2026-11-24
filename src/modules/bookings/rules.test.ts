import { describe, expect, it } from "vitest";

import {
  buildIcs,
  cancelledWhatsAppMessage,
  foldIcsLine,
  formatClock,
  formatSlotDate,
  formatTimeRange,
  groupByDate,
  icsEscape,
  isSlotUpcoming,
  officeWhatsAppMessage,
  sameName,
  seatsLeft,
  seatsLeftLabel,
  shareSlotMessage,
  venueDateTimeToUtc,
  venueNow,
} from "./rules";
import { bookingRequestSchema, bookingSlotSchema, publicSlotFiltersSchema, staffBookingSchema } from "./schemas";

describe("venue clock", () => {
  it("gives the date and time in India", () => {
    expect(venueNow(new Date("2026-11-23T20:00:00Z"))).toEqual({ date: "2026-11-24", time: "01:30" });
    expect(venueNow(new Date("2026-11-23T04:00:00Z"))).toEqual({ date: "2026-11-23", time: "09:30" });
  });

  it("treats a slot as upcoming until it starts", () => {
    const now = new Date("2026-12-05T03:59:00Z"); // 09:29 IST
    expect(isSlotUpcoming({ date: "2026-12-05", startTime: "09:30" }, now)).toBe(true);
    expect(isSlotUpcoming({ date: "2026-12-05", startTime: "09:29" }, now)).toBe(false);
    expect(isSlotUpcoming({ date: "2026-12-04", startTime: "23:59" }, now)).toBe(false);
    expect(isSlotUpcoming({ date: "2026-12-06", startTime: "00:00" }, now)).toBe(true);
  });

  it("converts venue times to UTC", () => {
    expect(venueDateTimeToUtc("2026-12-05", "09:30").toISOString()).toBe("2026-12-05T04:00:00.000Z");
    expect(venueDateTimeToUtc("2026-12-05", "02:00").toISOString()).toBe("2026-12-04T20:30:00.000Z");
  });
});

describe("seats and wording", () => {
  it("counts seats left", () => {
    expect(seatsLeft({ capacity: 10, bookedSeats: 4 })).toBe(6);
    expect(seatsLeft({ capacity: 10, bookedSeats: 12 })).toBe(0);
    expect(seatsLeftLabel(0)).toBe("Full");
    expect(seatsLeftLabel(1)).toBe("1 seat left");
    expect(seatsLeftLabel(12)).toBe("12 seats left");
  });

  it("formats dates and times the same everywhere", () => {
    expect(formatSlotDate("2026-12-05")).toBe("Saturday, 5 December 2026");
    expect(formatSlotDate("2026-11-23", "short")).toBe("Mon 23 Nov");
    expect(formatClock("09:30")).toBe("9:30 am");
    expect(formatClock("12:00")).toBe("12:00 pm");
    expect(formatClock("00:15")).toBe("12:15 am");
    expect(formatClock("23:59")).toBe("11:59 pm");
    expect(formatTimeRange("09:30", "13:00")).toBe("9:30 am to 1:00 pm");
    expect(formatTimeRange("09:30", null)).toBe("9:30 am");
  });

  it("matches a name the way people retype it", () => {
    expect(sameName("Ravi Kumar", "  ravi   KUMAR. ")).toBe(true);
    expect(sameName("R. Kumar", "r kumar")).toBe(true);
    expect(sameName("Ravi Kumar", "Ravi")).toBe(false);
    expect(sameName("Ravi Kumar", "Someone Else")).toBe(false);
    expect(sameName("", "")).toBe(false);
  });

  it("groups consecutive slots by date", () => {
    const groups = groupByDate([
      { date: "2026-12-05", id: 1 },
      { date: "2026-12-05", id: 2 },
      { date: "2026-12-06", id: 3 },
    ]);
    expect(groups.map((g) => [g.date, g.items.map((i) => i.id)])).toEqual([
      ["2026-12-05", [1, 2]],
      ["2026-12-06", [3]],
    ]);
  });

  it("builds WhatsApp messages with the booking details", () => {
    const slot = { title: "6G pipe welding test", date: "2026-12-05", startTime: "09:30", endTime: "13:00" };
    const office = officeWhatsAppMessage({ code: "VSG-BKG-000123", name: "Ravi", seats: 3, organizationName: "Sai Travels", slot });
    expect(office).toContain("6G pipe welding test on Saturday, 5 December 2026 at 9:30 am");
    expect(office).toContain("VSG-BKG-000123");
    expect(office).toContain("Sai Travels, 3 seats");
    expect(cancelledWhatsAppMessage({ name: "Ravi", code: "VSG-BKG-000123", reason: "Examiner not available", slot })).toContain("Reason: Examiner not available.");
    // The number was booked under another name: ask the office, without any code or company.
    const ask = officeWhatsAppMessage({ code: null, existing: true, name: "Someone", seats: 1, organizationName: null, slot });
    expect(ask).toContain("my mobile number already has a booking for 6G pipe welding test");
    expect(ask).not.toContain("VSG-BKG");
    const share = shareSlotMessage({ slot: { ...slot, kind: "trade_test", venue: "Autonagar" }, seatsLeft: 4, url: "https://example.test/book/VSG-SLT-000001" });
    expect(share.split("\n")).toEqual(["Trade test: 6G pipe welding test", "Saturday, 5 December 2026, 9:30 am to 1:00 pm", "Autonagar", "4 seats left", "Book your seat: https://example.test/book/VSG-SLT-000001"]);
  });
});

describe("calendar file", () => {
  it("escapes text values", () => {
    expect(icsEscape("Bring passport, photos; shoes\\boots\nCome early")).toBe("Bring passport\\, photos\\; shoes\\\\boots\\nCome early");
  });

  it("folds long lines at 75 octets without splitting characters", () => {
    const line = `DESCRIPTION:${"వెల్డింగ్ పరీక్ష ".repeat(12)}`;
    const folded = foldIcsLine(line);
    const parts = folded.split("\r\n");
    expect(parts.length).toBeGreaterThan(1);
    for (const part of parts) expect(new TextEncoder().encode(part).length).toBeLessThanOrEqual(75);
    expect(parts.slice(1).every((p) => p.startsWith(" "))).toBe(true);
    expect(parts.map((p, i) => (i === 0 ? p : p.slice(1))).join("")).toBe(line);
  });

  it("writes one event in UTC with CRLF line endings", () => {
    const ics = buildIcs({
      uid: "VSG-SLT-000001@venkatsai",
      title: "6G test, Venkat Sai",
      description: "Bring passport",
      location: "Autonagar, Gajuwaka",
      date: "2026-12-05",
      startTime: "09:30",
      endTime: "13:00",
      stamp: new Date("2026-11-23T10:00:00Z"),
    });
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("DTSTART:20261205T040000Z\r\n");
    expect(ics).toContain("DTEND:20261205T073000Z\r\n");
    expect(ics).toContain("DTSTAMP:20261123T100000Z\r\n");
    expect(ics).toContain("SUMMARY:6G test\\, Venkat Sai\r\n");
    expect(ics).not.toMatch(/[^\r]\n/);
    const noEnd = buildIcs({ uid: "x", title: "t", description: "d", location: "l", date: "2026-12-05", startTime: "09:30", endTime: null, stamp: new Date() });
    expect(noEnd).not.toContain("DTEND");
  });
});

describe("booking form validation", () => {
  const base = { slot: "vsg-slt-000123", name: "Ravi Kumar", phone: "98765 43210", trade: "Pipe welder", consentToContact: "true" };

  it("books one seat for an individual (organisation fields ignored)", () => {
    const v = bookingRequestSchema.parse({ ...base, organizationName: "Ignored", seats: "5" });
    expect(v).toMatchObject({ slotCode: "VSG-SLT-000123", phone: "+919876543210", seats: 1, organizationName: null, email: null });
  });

  it("needs the organisation name and seats for a company or travel agency booking", () => {
    const missing = bookingRequestSchema.safeParse({ ...base, forOrganization: "true" });
    expect(missing.success).toBe(false);
    const paths = missing.error!.issues.map((i) => i.path.join("."));
    expect(paths).toEqual(expect.arrayContaining(["organizationName", "seats"]));
    const ok = bookingRequestSchema.parse({ ...base, forOrganization: "true", organizationName: "Sai Travels", seats: "4", email: "Agent@Example.COM" });
    expect(ok).toMatchObject({ organizationName: "Sai Travels", seats: 4, email: "agent@example.com" });
  });

  it("refuses bad input", () => {
    expect(bookingRequestSchema.safeParse({ ...base, forOrganization: "true", organizationName: "X", seats: "21" }).success).toBe(false);
    expect(bookingRequestSchema.safeParse({ ...base, forOrganization: "true", organizationName: "X", seats: "0" }).success).toBe(false);
    expect(bookingRequestSchema.safeParse({ ...base, consentToContact: undefined }).success).toBe(false);
    expect(bookingRequestSchema.safeParse({ ...base, phone: "123" }).success).toBe(false);
    expect(bookingRequestSchema.safeParse({ ...base, slot: "VSG-CV-000123" }).success).toBe(false);
    expect(bookingRequestSchema.safeParse({ ...base, name: undefined }).success).toBe(false);
    expect(bookingRequestSchema.safeParse({ ...base, email: "not-an-email" }).success).toBe(false);
  });

  it("validates staff bookings (seats required, consent confirmed)", () => {
    const slotId = "7f1f3c1e-2a8b-4c55-9a77-0d3f8e0f1a22";
    expect(staffBookingSchema.safeParse({ slotId, name: "A", phone: "9876543210", trade: "Fitter", seats: "2", consentToContact: "on" }).success).toBe(true);
    expect(staffBookingSchema.safeParse({ slotId, name: "A", phone: "9876543210", trade: "Fitter", seats: "2" }).success).toBe(false);
    expect(staffBookingSchema.safeParse({ slotId, name: "A", phone: "9876543210", trade: "Fitter", consentToContact: "on" }).success).toBe(false);
  });
});

describe("slot form validation", () => {
  const base = { kind: "trade_test", title: "6G test", trade: "Pipe welder", date: "2026-12-05", startTime: "09:30", capacity: "10" };

  it("accepts a slot and normalises times", () => {
    const v = bookingSlotSchema.parse({ ...base, startTime: "09:30:00", endTime: "13:00" });
    expect(v).toMatchObject({ startTime: "09:30", endTime: "13:00", capacity: 10 });
  });

  it("refuses end before start, impossible dates and empty seats", () => {
    expect(bookingSlotSchema.safeParse({ ...base, endTime: "09:00" }).success).toBe(false);
    expect(bookingSlotSchema.safeParse({ ...base, date: "2026-02-30" }).success).toBe(false);
    expect(bookingSlotSchema.safeParse({ ...base, capacity: "0" }).success).toBe(false);
    expect(bookingSlotSchema.safeParse({ ...base, capacity: "501" }).success).toBe(false);
    expect(bookingSlotSchema.safeParse({ ...base, startTime: "25:00" }).success).toBe(false);
    expect(bookingSlotSchema.safeParse({ ...base, kind: "party" }).success).toBe(false);
  });

  it("reads public filters leniently", () => {
    expect(publicSlotFiltersSchema.parse({ kind: "trade-test", course: "Welding-Basics" })).toEqual({ kind: "trade_test", course: "welding-basics" });
    expect(publicSlotFiltersSchema.parse({ kind: "nonsense", course: "../etc" })).toEqual({ kind: undefined, course: undefined });
  });
});
