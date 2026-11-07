import { CalendarDays, CalendarRange, MapPin, MonitorPlay } from "lucide-react";
import type { Metadata } from "next";

import { EmptyState } from "@/components/shared/empty-state";
import { LinkTabs } from "@/components/shared/link-tabs";
import { Pagination } from "@/components/shared/pagination";
import { withParams } from "@/lib/http";
import { EVENT_FORMAT_OPTIONS, EVENT_TYPE_OPTIONS } from "@/modules/content/collections";
import { getPublishedEntries } from "@/modules/content/queries";

import { EntryCard, EntryGrid } from "../../news/_components/entry-card";
import { PublicHero, PublicSection } from "../../news/_components/public-hero";
import { assetFor, emptyEntryPage, listingMetadata, safeLoad, siteTimeZone, type PageSearchParams } from "../../news/_lib/cms";
import { pageParam, pickParam, safeTimeZone } from "../../news/_lib/text";
import { eventTiming, formatEventSchedule } from "../_lib/schedule";

const TYPE_VALUES = EVENT_TYPE_OPTIONS.map((o) => o.value);
const TYPE_LABEL: Record<string, string> = Object.fromEntries(EVENT_TYPE_OPTIONS.map((o) => [o.value, o.label]));
const FORMAT_LABEL: Record<string, string> = Object.fromEntries(EVENT_FORMAT_OPTIONS.map((o) => [o.value, o.label]));

export async function generateMetadata({ searchParams }: { searchParams: PageSearchParams }): Promise<Metadata> {
  const sp = await searchParams;
  const past = sp.when === "past";
  return listingMetadata(
    past ? "Past events" : "Events and hiring drives",
    "Career events, job fairs, hiring drives, webinars and campus drives run or supported by Venkat Sai Global.",
    "/events",
    { noindex: past || pageParam(sp.page) > 1 || Boolean(sp.type) },
  );
}

export default async function EventsPage({ searchParams }: { searchParams: PageSearchParams }) {
  const sp = await searchParams;
  const past = sp.when === "past";
  const type = pickParam(sp.type, TYPE_VALUES);
  const page = pageParam(sp.page);
  const result = await safeLoad("events", () => getPublishedEntries("events", { upcoming: !past, category: type, page, pageSize: 12 }), emptyEntryPage<"events">());
  const fallbackTz = siteTimeZone();
  const now = new Date();
  const when = past ? "past" : undefined;
  /** Canonical list URL (fixed parameter order, so tab hrefs compare equal). */
  const href = (w: string | undefined, t: string | undefined) => withParams("/events", {}, { when: w, type: t });

  return (
    <>
      <PublicHero
        eyebrow="Events"
        title="Events and hiring drives"
        description="Job fairs, hiring drives, campus drives and webinars. Venkat Sai Global never charges candidates to register for or attend a hiring event."
        breadcrumbs={[{ label: "Events" }]}
      />
      <div className="container-page">
        <PublicSection>
          <div className="mb-8 space-y-4">
            <LinkTabs
              label="Upcoming or past events"
              items={[
                { href: href(undefined, type), label: "Upcoming" },
                { href: href("past", type), label: "Past" },
              ]}
              activeHref={href(when, type)}
            />
            <LinkTabs
              label="Event type"
              items={[
                { href: href(when, undefined), label: "All types" },
                ...EVENT_TYPE_OPTIONS.map((o) => ({ href: href(when, o.value), label: o.label })),
              ]}
              activeHref={href(when, type)}
            />
          </div>
          {result.items.length ? (
            <>
              <EntryGrid label={past ? "Past events" : "Upcoming events"}>
                {result.items.map((entry) => {
                  const d = entry.data;
                  const tz = safeTimeZone(d.timezone, fallbackTz);
                  const timing = eventTiming(d.startsAt, d.endsAt, now);
                  return (
                    <EntryCard
                      key={entry.id}
                      href={entry.path ?? `/events/${entry.slug}`}
                      title={entry.title}
                      summary={entry.summary}
                      eyebrow={TYPE_LABEL[d.eventType] ?? "Event"}
                      image={assetFor(result.assets, entry.heroAssetId)}
                      placeholderIcon={<CalendarRange />}
                      badge={
                        timing === "ongoing" ? (
                          <span className="rounded-full bg-success-soft px-2.5 py-1 text-xs font-semibold text-success-strong">Happening now</span>
                        ) : null
                      }
                      meta={
                        <>
                          <span className="inline-flex items-center gap-1.5">
                            <CalendarDays className="size-3.5" aria-hidden="true" />
                            {formatEventSchedule(d.startsAt, d.endsAt, tz)}
                          </span>
                          <span className="inline-flex items-center gap-1.5">
                            {d.format === "online" ? <MonitorPlay className="size-3.5" aria-hidden="true" /> : <MapPin className="size-3.5" aria-hidden="true" />}
                            {d.format === "online" ? FORMAT_LABEL.online : [d.venue?.city, d.format === "hybrid" ? "and online" : null].filter(Boolean).join(" ") || FORMAT_LABEL[d.format]}
                          </span>
                        </>
                      }
                    />
                  );
                })}
              </EntryGrid>
              <Pagination className="mt-10" pathname="/events" searchParams={sp} page={result.page} pageCount={result.pageCount} total={result.total} pageSize={result.pageSize} itemLabel="events" />
            </>
          ) : (
            <EmptyState
              icon={<CalendarRange />}
              titleAs="h2"
              title={past ? "No past events to show" : type ? `No upcoming ${TYPE_LABEL[type]?.toLowerCase()}s` : "No upcoming events right now"}
              description={
                past
                  ? "Events appear here after they have taken place."
                  : "New job fairs, hiring drives and webinars are announced here and in our news. You can apply for open jobs at any time."
              }
              primaryAction={{ label: "Browse jobs", href: "/jobs" }}
              secondaryAction={past ? { label: "Upcoming events", href: "/events", variant: "outline" } : { label: "Latest news", href: "/news?category=hiring_drive", variant: "outline" }}
            />
          )}
        </PublicSection>
      </div>
    </>
  );
}
