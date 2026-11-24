import type { NextRequest } from "next/server";

import { CONTACT } from "@/config/contact";
import { logger } from "@/lib/logger";
import { getPublicSlot } from "@/modules/bookings/queries";
import { buildIcs } from "@/modules/bookings/rules";
import { BOOKING_CODE_PATTERN, BOOKING_KIND_LABELS, SLOT_CODE_PATTERN } from "@/modules/bookings/schemas";

/**
 * GET /book/<slot code>/calendar[?ref=VSG-BKG-000123] — "Add to calendar" file (.ics) for a slot: public slot
 * details only (title, date, time, place, what to bring); the optional booking code is echoed into the description.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ code: string }> }): Promise<Response> {
  const code = (await params).code.trim().toUpperCase();
  if (!SLOT_CODE_PATTERN.test(code)) return new Response("Not found.", { status: 404 });
  const refParam = request.nextUrl.searchParams.get("ref")?.trim().toUpperCase() ?? "";
  const ref = BOOKING_CODE_PATTERN.test(refParam) ? refParam : null;
  try {
    const slot = await getPublicSlot(code);
    if (!slot || slot.state === "cancelled") return new Response("Not found.", { status: 404 });
    const description = [
      `${BOOKING_KIND_LABELS[slot.kind]}: ${slot.trade}`,
      ref ? `Booking code: ${ref}` : null,
      slot.instructions ? `What to bring: ${slot.instructions}` : null,
      slot.feeNote ? `Fees: ${slot.feeNote}` : null,
      `Questions: WhatsApp or call +91 ${CONTACT.whatsapp.display}`,
      CONTACT.businessName,
    ]
      .filter(Boolean)
      .join("\n");
    const ics = buildIcs({
      uid: `${slot.code}${ref ? `-${ref}` : ""}@venkatsai`,
      title: `${slot.title} (Venkat Sai)`,
      description,
      location: slot.venue,
      date: slot.date,
      startTime: slot.startTime,
      endTime: slot.endTime,
      stamp: new Date(),
    });
    return new Response(ics, {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `attachment; filename="venkat-sai-${slot.code.toLowerCase()}.ics"`,
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex",
      },
    });
  } catch (error) {
    logger.error("Calendar file failed", { error });
    return new Response("The calendar file could not be made. Please try again.", { status: 500 });
  }
}
