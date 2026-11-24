# Bookings (`src/modules/bookings`)

Online booking of trade tests (for example a 6G pipe welding test) and training seats at the Venkat Sai centre,
with a fixed number of seats per date. Individuals book one seat; travel agencies and companies book 1–20 seats.

Tables (`src/db/schema/bookings.ts`): `booking_slots` (code `VSG-SLT-…`) and `slot_bookings` (code `VSG-BKG-…`).
`booking_slots.bookedSeats` = seats of the slot's bookings that are not cancelled, always `<= capacity`.

## Rules

- **Seats are taken atomically** inside the booking transaction:
  `UPDATE booking_slots SET booked_seats = booked_seats + n WHERE id = … AND status = 'open' AND booked_seats + n <= capacity AND <starts later> RETURNING …`.
  The second of two people racing for the last seat gets `ActionError` code `slot_full`.
- **One active booking per phone per slot** (partial unique index `slot_bookings_active_phone_uq`): the public form
  returns the existing booking (`existing: true`), also when a double tap races for the last seat. Its code, seats
  and company go back only when the same name is typed (`sameName`); otherwise `code: null` and the page says the
  number is already booked (someone who only knows a number never sees another person's booking). Staff get an
  error naming it.
- **Lock order:** slot row first, then its bookings (`setBookingStatus`, `cancelSlot`, staff bookings), so
  concurrent changes on one date wait for each other instead of deadlocking.
- Cancelling a booking gives its seats back; restoring it takes them again only while seats are free.
- Bookings close when the slot starts (venue time, Asia/Kolkata). Closed slots take no new public bookings; staff can
  still add bookings until the day. Cancelling a slot is final: its `booked` bookings become `cancelled` with
  `cancelledWithSlot = true` (the people to tell).
- Fees are free text typed by staff (`feeNote`), shown as written; the system never states amounts.
- Public form: zod-validated, consent required, honeypot, rate limits (10 per 10 minutes and 30 per day per network,
  5 per hour per phone), `ipHash` only. One network holds at most `WEBSITE_SEATS_PER_NETWORK` (20) website seats per
  date across all the numbers typed from it (no seat hoarding with made-up numbers); staff bookings are not capped.

## Public API

| File | Exports |
|---|---|
| `schemas.ts` (client-safe) | `BOOKINGS_PERMISSION` (`recruitment.assessments`), paths, labels/tones, `bookingRequestSchema`, `staffBookingSchema`, `bookingSlotSchema`, `slotCancelSchema`, `bookingStatusSchema`, `publicSlotFiltersSchema`, `staffSlotFiltersSchema`, `PublicSlotView`, `BookingResult` |
| `rules.ts` (client-safe, pure) | `venueNow`, `isSlotUpcoming`, `seatsLeft`, `seatsLeftLabel`, `formatSlotDate`, `formatClock`, `formatTimeRange`, `groupByDate`, WhatsApp message builders, `whatsappShareHref`, `buildIcs` |
| `queries.ts` | `listPublicSlots`, `getPublicSlot`, `findPublicCourse`, `countBookableSlotsForCourse`, `listSlotsForStaff`, `upcomingSlotSummary`, `getSlotForStaff` (phones need `candidates.view_contact`, views logged), `listCourseOptions` |
| `service.ts` | `bookSlot` (public), `createStaffBooking`, `setBookingStatus`, `createSlot`, `updateSlot`, `setSlotOpen`, `cancelSlot` |
| `actions.ts` | `bookSlotAction`, `saveSlotAction`, `setSlotOpenAction`, `cancelSlotAction`, `setBookingStatusAction`, `addStaffBookingAction` |

Notifications: `booking.received` (staff in-app without the phone number; business inbox email with it).

Routes: `/book`, `/book/<slot code>`, `/book/<slot code>/calendar` (.ics), `/admin/bookings`, `/admin/bookings/new`,
`/admin/bookings/<id>`, `/admin/bookings/<id>/edit`, `/admin/bookings/<id>/print`, `/admin/bookings/<id>/export`.

Tests: `rules.test.ts` (pure logic and schemas), `bookings.integration.test.ts` (race for the last seat, duplicate
phone, cancel frees seats, closed / past / cancelled slots, notifications, masking) against a `vsg_t_*` database.
