import { CalendarX2, ShieldCheck, X } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PageHero } from "@/components/public/page-hero";
import { CallButton, WhatsAppButton } from "@/components/public/requirements/contact-buttons";
import { buildPageMetadata, settle } from "@/components/public/server";
import { type SearchParams } from "@/lib/http";
import { findPublicCourse, listPublicSlots } from "@/modules/bookings/queries";
import { formatSlotDate, groupByDate } from "@/modules/bookings/rules";
import { BOOKING_KIND_LABELS, publicSlotFiltersSchema, type PublicSlotFilters } from "@/modules/bookings/schemas";

import { SlotCard } from "./_components/slot-card";

export const metadata: Metadata = buildPageMetadata({
  title: "Book a trade test or training seat",
  description: "Book a trade test (such as a 6G pipe welding test) or a training seat at Venkat Sai in Visakhapatnam. Choose a date and book in one minute, no account needed.",
  path: "/book",
});

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

const TABS: { kind: PublicSlotFilters["kind"]; label: string }[] = [
  { kind: undefined, label: "All dates" },
  { kind: "trade_test", label: "Trade tests" },
  { kind: "training", label: "Training" },
];

function tabHref(kind: PublicSlotFilters["kind"], course: string | undefined): string {
  const params = new URLSearchParams();
  if (kind) params.set("kind", kind);
  if (course && kind === "training") params.set("course", course);
  const qs = params.toString();
  return qs ? `/book?${qs}` : "/book";
}

/**
 * Public booking list: upcoming open trade test and training dates grouped by day, with seats left. Filters:
 * ?kind=trade_test|training and ?course=<course slug> (from a course page). Honest empty state with WhatsApp and call.
 */
export default async function BookPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const filters = publicSlotFiltersSchema.parse({ kind: first(sp.kind), course: first(sp.course) });
  const course = filters.course ? await settle("booking_course", () => findPublicCourse(filters.course!), null) : null;
  const kind = course ? "training" : filters.kind;
  const slots = await settle("booking_slots", () => listPublicSlots({ kind, courseId: course?.id }), []);
  const groups = groupByDate(slots);
  const askMessage = course
    ? `Hello Venkat Sai, when is the next training date for ${course.title}?`
    : kind === "trade_test"
      ? "Hello Venkat Sai, when is the next trade test date?"
      : kind === "training"
        ? "Hello Venkat Sai, when is the next training date?"
        : "Hello Venkat Sai, I would like to book a trade test or training seat.";

  return (
    <>
      <PageHero
        eyebrow="Trade tests and training"
        title="Book your seat"
        intro="Choose a date and book a trade test or training seat in one minute. No account needed. Travel agencies and companies can book several seats at once."
        breadcrumbs={[{ label: "Home", href: "/" }, { label: "Book a trade test or training seat" }]}
      />
      <div className="container-page space-y-8 pb-16 sm:pb-20">
        <nav aria-label="Show dates for" className="-mx-1 overflow-x-auto px-1">
          <ul className="flex min-w-max gap-2">
            {TABS.map((tab) => {
              const active = (kind ?? undefined) === tab.kind;
              return (
                <li key={tab.label}>
                  <Link
                    href={tabHref(tab.kind, course?.slug)}
                    aria-current={active ? "page" : undefined}
                    className="inline-flex min-h-11 items-center rounded-full border border-border bg-white px-5 text-[15px] font-semibold text-foreground transition-colors hover:bg-surface-subtle aria-[current=page]:border-foreground aria-[current=page]:bg-foreground aria-[current=page]:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    {tab.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {course ? (
          <p className="flex flex-wrap items-center gap-x-3 gap-y-2 text-base text-foreground" data-testid="course-filter">
            <span>
              Training dates for <strong className="font-semibold">{course.title}</strong>
            </span>
            <Link href="/book?kind=training" className="inline-flex min-h-11 items-center gap-1 rounded-full border border-border px-4 text-sm font-medium hover:bg-surface-subtle">
              <X className="size-4" aria-hidden="true" />
              Show all training dates
            </Link>
          </p>
        ) : null}

        {groups.length ? (
          <div className="space-y-10">
            {groups.map((group) => (
              <section key={group.date} aria-labelledby={`day-${group.date}`}>
                <h2 id={`day-${group.date}`} className="scroll-mt-24 font-heading text-lg font-semibold text-foreground sm:text-xl">
                  {formatSlotDate(group.date)}
                </h2>
                <ul className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {group.items.map((slot) => (
                    <SlotCard key={slot.code} slot={slot} />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        ) : (
          <section className="card-surface rounded-3xl p-6 sm:p-10" aria-labelledby="no-dates" data-testid="book-empty">
            <CalendarX2 className="size-10 text-muted-foreground" aria-hidden="true" />
            <h2 id="no-dates" className="mt-4 font-heading text-2xl font-bold text-foreground">
              No {kind ? BOOKING_KIND_LABELS[kind].toLowerCase() : "trade test or training"} dates are open right now
            </h2>
            <p className="mt-2 max-w-2xl text-base text-muted-foreground">
              We add new dates often. Message us on WhatsApp or call, and we will tell you the next date and book your seat.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <WhatsAppButton message={askMessage} label="Ask on WhatsApp" />
              <CallButton />
            </div>
          </section>
        )}

        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-foreground" aria-hidden="true" />
          <span>
            Venkat Sai never charges candidates to apply for a job, and no payment can guarantee a job or visa.{" "}
            <Link href="/safe-recruitment" className="font-medium text-teal-strong underline underline-offset-4">
              How to stay safe
            </Link>
          </span>
        </p>
      </div>
    </>
  );
}
